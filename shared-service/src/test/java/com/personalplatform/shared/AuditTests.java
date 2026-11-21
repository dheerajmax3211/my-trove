package com.personalplatform.shared;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.personalplatform.shared.audit.AuditService;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class AuditTests extends AbstractIntegrationTest {

    @Autowired AuditService audit;

    private UUID insertEvent() {
        UUID id = UUID.randomUUID();
        audit.record("actor-" + id, null, "test.event", "thing", id.toString(), Map.of("k", "v"));
        return (UUID) dsl.fetchValue("select id from shared.audit_events where subject_id = ?", id.toString());
    }

    @Test
    void databaseRejectsUpdate() {
        UUID id = insertEvent();
        assertThatThrownBy(() -> dsl.execute("update shared.audit_events set action = 'tampered' where id = ?", id))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("append-only");
        assertThat(dsl.fetchValue("select action from shared.audit_events where id = ?", id)).isEqualTo("test.event");
    }

    @Test
    void databaseRejectsDelete() {
        UUID id = insertEvent();
        assertThatThrownBy(() -> dsl.execute("delete from shared.audit_events where id = ?", id))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("append-only");
        assertThat(dsl.fetchCount(org.jooq.impl.DSL.table("shared.audit_events"),
                org.jooq.impl.DSL.field("id").eq(id))).isEqualTo(1);
    }

    @Test
    void databaseRejectsTruncate() {
        insertEvent();
        assertThatThrownBy(() -> dsl.execute("truncate shared.audit_events"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("append-only");
        assertThat(dsl.fetchCount(org.jooq.impl.DSL.table("shared.audit_events"))).isPositive();
    }

    @Test
    void deletingAHouseholdDoesNotEraseItsAuditTrail() throws Exception {
        String alice = uid("alice");
        UUID h = createHousehold(alice, "Home");
        deleteAs(alice, "/v1/households/" + h).andExpect(status().isNoContent());
        assertThat(dsl.fetchCount(org.jooq.impl.DSL.table("shared.audit_events"),
                org.jooq.impl.DSL.field("household_id").eq(h))).isEqualTo(2); // created + deleted
    }

    @Test
    void householdFeedIsPagedNewestFirstAndReadableByMembers() throws Exception {
        String alice = uid("alice"), bob = uid("bob");
        UUID h = createHousehold(alice, "Home");
        join(bob, h, alice); // household.created, invite.created, member.joined
        for (int i = 0; i < 4; i++) {
            clock.advance(java.time.Duration.ofMinutes(1));
            postAs(alice, "/v1/reminders", "{\"title\":\"r" + i + "\",\"dueAt\":\"2026-02-01T00:00:00Z\",\"householdId\":\"" + h + "\"}")
                    .andExpect(status().isCreated());
        }
        getAs(bob, "/v1/audit?householdId=" + h + "&size=3&page=0").andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(7))
                .andExpect(jsonPath("$.items", hasSize(3)))
                .andExpect(jsonPath("$.items[0].action").value("reminder.created"))
                .andExpect(jsonPath("$.items[0].actorUid").value(alice))
                .andExpect(jsonPath("$.items[0].details.title").value("r3"));
        getAs(bob, "/v1/audit?householdId=" + h + "&size=3&page=2").andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].action").value("household.created"));
        getAs(bob, "/v1/audit?householdId=" + h + "&action=member.joined").andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void personalFeedShowsOnlyTheCallersPersonalEvents() throws Exception {
        String alice = uid("alice"), bob = uid("bob");
        postAs(alice, "/v1/reminders", "{\"title\":\"mine\",\"dueAt\":\"2026-02-01T00:00:00Z\"}").andExpect(status().isCreated());
        postAs(bob, "/v1/reminders", "{\"title\":\"bobs\",\"dueAt\":\"2026-02-01T00:00:00Z\"}").andExpect(status().isCreated());
        getAs(alice, "/v1/audit").andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].details.title").value("mine"));
    }

    @Test
    void auditRowCommitsOrRollsBackWithTheAction() {
        // an action that fails after auditing leaves no audit row (same transaction)
        String alice = uid("alice");
        long before = dsl.fetchCount(org.jooq.impl.DSL.table("shared.audit_events"),
                org.jooq.impl.DSL.field("actor_uid").eq(alice));
        assertThat(before).isZero();
        new org.springframework.transaction.support.TransactionTemplate(txManager).execute(status -> {
            audit.record(alice, null, "x", "y", "z", Map.of());
            status.setRollbackOnly();
            return null;
        });
        assertThat(dsl.fetchCount(org.jooq.impl.DSL.table("shared.audit_events"),
                org.jooq.impl.DSL.field("actor_uid").eq(alice))).isZero();
    }
}
