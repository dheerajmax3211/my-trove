package com.personalplatform.consent.audit;

import static com.personalplatform.sql.jooq.consent.consent.Tables.AUDIT_LOG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.personalplatform.consent.support.IntegrationTest;
import java.sql.Connection;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import javax.sql.DataSource;
import org.jooq.Record;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;

class AuditChainTest extends IntegrationTest {

    private static final String TRIGGER = "audit_log_no_update_delete";

    @Autowired DataSource dataSource;

    /** An owner with {@code n} audit entries (one vault create each). */
    private String ownerWithEntries(int n) throws Exception {
        String owner = newOwner();
        for (int i = 1; i <= n; i++) {
            putAttribute(owner, "profile.item" + i, "'v" + i + "'", "PUBLIC");
        }
        return owner;
    }

    /** Runs {@code tamper} on a connection with the append-only trigger switched off; always switches it back on. */
    private void tamperingAsSuperuser(String sql) throws Exception {
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute("alter table consent.audit_log disable trigger " + TRIGGER);
            try {
                st.execute(sql);
            } finally {
                st.execute("alter table consent.audit_log enable trigger " + TRIGGER);
            }
        }
    }

    private static String q(String s) {
        return "'" + s.replace("'", "''") + "'";
    }

    @Test
    void untouchedChainVerifiesAndCoversEveryAction() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.sizes.shoe", "43", "PERSONAL");
        Access a = grantAccess(owner, "profile.sizes:read");
        readData(a.accessToken(), null).andExpect(status().isOk());
        readData(a.accessToken(), "path=health").andExpect(status().isForbidden());
        ownerPost(owner, "/v1/owner/grants/" + a.grantId() + "/revoke", null).andExpect(status().isOk());
        readData(a.accessToken(), null).andExpect(status().isForbidden());

        ownerGet(owner, "/v1/owner/audit/verify").andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.entriesChecked").value(9))
                .andExpect(jsonPath("$.firstBrokenSeq").doesNotExist());
        List<String> types = dsl.select(AUDIT_LOG.EVENT_TYPE).from(AUDIT_LOG).where(AUDIT_LOG.OWNER_UID.eq(owner))
                .orderBy(AUDIT_LOG.OWNER_SEQ).fetch(AUDIT_LOG.EVENT_TYPE);
        assertThat(types).containsExactly("VAULT_ATTRIBUTE_CREATED", "CLIENT_REGISTERED", "ACCESS_REQUESTED", "REQUEST_APPROVED",
                "TOKEN_ISSUED", "DATA_READ", "DATA_DENIED", "GRANT_REVOKED", "DATA_DENIED");
        // each entry links to the previous one
        List<Record> rows = new ArrayList<>(dsl.select(AUDIT_LOG.PREV_HASH, AUDIT_LOG.ENTRY_HASH).from(AUDIT_LOG)
                .where(AUDIT_LOG.OWNER_UID.eq(owner)).orderBy(AUDIT_LOG.OWNER_SEQ).fetch());
        assertThat(rows.get(0).get(AUDIT_LOG.PREV_HASH)).isEqualTo(AuditHasher.GENESIS);
        for (int i = 1; i < rows.size(); i++) {
            assertThat(rows.get(i).get(AUDIT_LOG.PREV_HASH)).isEqualTo(rows.get(i - 1).get(AUDIT_LOG.ENTRY_HASH));
        }
    }

    @Test
    void emptyChainIsValid() throws Exception {
        ownerGet(newOwner(), "/v1/owner/audit/verify").andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.entriesChecked").value(0));
    }

    @Test
    void auditEntriesNeverContainAttributeValues() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "health.allergies", "'peanut-allergy-TOPSECRET'", "SENSITIVE");
        Access a = grantAccess(owner, "health:read");
        readData(a.accessToken(), null).andExpect(status().isOk()).andExpect(jsonPath("$.attributes[0].value").value("peanut-allergy-TOPSECRET"));
        List<String> details = dsl.select(AUDIT_LOG.DETAIL).from(AUDIT_LOG).where(AUDIT_LOG.OWNER_UID.eq(owner)).fetch(AUDIT_LOG.DETAIL);
        assertThat(String.join(" ", details)).doesNotContain("TOPSECRET").contains("health.allergies");
    }

    @Test
    void databaseTriggerBlocksUpdateDeleteAndTruncate() throws Exception {
        String owner = ownerWithEntries(2);
        assertThatThrownBy(() -> dsl.update(AUDIT_LOG).set(AUDIT_LOG.DETAIL, "{\"forged\":true}")
                        .where(AUDIT_LOG.OWNER_UID.eq(owner)).execute())
                .isInstanceOf(DataAccessException.class).hasMessageContaining("append-only");
        assertThatThrownBy(() -> dsl.deleteFrom(AUDIT_LOG).where(AUDIT_LOG.OWNER_UID.eq(owner)).execute())
                .isInstanceOf(DataAccessException.class).hasMessageContaining("append-only");
        assertThatThrownBy(() -> dsl.execute("truncate table consent.audit_log"))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("append-only");
        // nothing changed
        assertThat(dsl.fetchCount(AUDIT_LOG, AUDIT_LOG.OWNER_UID.eq(owner))).isEqualTo(2);
        ownerGet(owner, "/v1/owner/audit/verify").andExpect(jsonPath("$.valid").value(true));
    }

    @Test
    void modifiedEntryIsDetectedAtItsSequenceNumber() throws Exception {
        String owner = ownerWithEntries(5);
        String bystander = ownerWithEntries(3);
        tamperingAsSuperuser("update consent.audit_log set detail = '{\"keyPath\":\"profile.forged\"}' where owner_uid = "
                + q(owner) + " and owner_seq = 3");

        ownerGet(owner, "/v1/owner/audit/verify").andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(false))
                .andExpect(jsonPath("$.firstBrokenSeq").value(3))
                .andExpect(jsonPath("$.reason").value("ENTRY_HASH_MISMATCH"))
                .andExpect(jsonPath("$.entriesChecked").value(2));
        // other owners' chains are independent
        ownerGet(bystander, "/v1/owner/audit/verify").andExpect(jsonPath("$.valid").value(true));
    }

    @Test
    void tamperingThatRecomputesTheEntryHashBreaksTheNextLink() throws Exception {
        String owner = ownerWithEntries(5);
        Record r = dsl.selectFrom(AUDIT_LOG).where(AUDIT_LOG.OWNER_UID.eq(owner).and(AUDIT_LOG.OWNER_SEQ.eq(3L))).fetchOne();
        String forgedDetail = "{\"keyPath\":\"profile.forged\"}";
        String forgedHash = AuditHasher.hash(r.get(AUDIT_LOG.PREV_HASH), owner, 3, r.get(AUDIT_LOG.EVENT_TYPE),
                r.get(AUDIT_LOG.ACTOR_TYPE), r.get(AUDIT_LOG.ACTOR_ID), r.get(AUDIT_LOG.CLIENT_ID), null, forgedDetail,
                r.get(AUDIT_LOG.OCCURRED_AT).toInstant());
        tamperingAsSuperuser("update consent.audit_log set detail = " + q(forgedDetail) + ", entry_hash = " + q(forgedHash)
                + " where owner_uid = " + q(owner) + " and owner_seq = 3");

        // entry 3 is internally consistent now, but entry 4 still points at the old hash
        ownerGet(owner, "/v1/owner/audit/verify")
                .andExpect(jsonPath("$.valid").value(false))
                .andExpect(jsonPath("$.firstBrokenSeq").value(4))
                .andExpect(jsonPath("$.reason").value("PREV_HASH_MISMATCH"));
    }

    @Test
    void deletedMiddleEntryIsDetected() throws Exception {
        String owner = ownerWithEntries(5);
        tamperingAsSuperuser("delete from consent.audit_log where owner_uid = " + q(owner) + " and owner_seq = 3");
        ownerGet(owner, "/v1/owner/audit/verify")
                .andExpect(jsonPath("$.valid").value(false))
                .andExpect(jsonPath("$.firstBrokenSeq").value(3))
                .andExpect(jsonPath("$.reason").value("SEQUENCE_GAP"));
    }

    @Test
    void truncatedTailIsDetectedAgainstTheChainHead() throws Exception {
        String owner = ownerWithEntries(5);
        tamperingAsSuperuser("delete from consent.audit_log where owner_uid = " + q(owner) + " and owner_seq = 5");
        ownerGet(owner, "/v1/owner/audit/verify")
                .andExpect(jsonPath("$.valid").value(false))
                .andExpect(jsonPath("$.firstBrokenSeq").value(5))
                .andExpect(jsonPath("$.reason").value("HEAD_MISMATCH"))
                .andExpect(jsonPath("$.headSeq").value(5));
    }

    @Test
    void firstBrokenLinkIsReported_evenWhenSeveralEntriesAreTampered() throws Exception {
        String owner = ownerWithEntries(6);
        tamperingAsSuperuser("update consent.audit_log set actor_id = 'someone-else' where owner_uid = " + q(owner)
                + " and owner_seq in (2, 5)");
        ownerGet(owner, "/v1/owner/audit/verify").andExpect(jsonPath("$.firstBrokenSeq").value(2));
    }

    @Test
    void concurrentAppendsKeepTheChainIntact() throws Exception {
        String owner = newOwner();
        int n = 16;
        ExecutorService pool = Executors.newFixedThreadPool(8);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                final int k = i;
                Callable<Integer> task = () -> mvc.perform(asOwner(post("/v1/owner/vault/attributes"), owner)
                                .content(json("{'keyPath':'concurrent.k" + k + "','value':" + k + ",'sensitivity':'PUBLIC'}")))
                        .andReturn().getResponse().getStatus();
                results.add(pool.submit(task));
            }
            for (Future<Integer> f : results) {
                assertThat(f.get()).isEqualTo(201);
            }
        } finally {
            pool.shutdownNow();
        }
        ownerGet(owner, "/v1/owner/audit/verify").andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.entriesChecked").value(n))
                .andExpect(jsonPath("$.headSeq").value(n));
        List<Long> seqs = dsl.select(AUDIT_LOG.OWNER_SEQ).from(AUDIT_LOG).where(AUDIT_LOG.OWNER_UID.eq(owner))
                .orderBy(AUDIT_LOG.OWNER_SEQ).fetch(AUDIT_LOG.OWNER_SEQ);
        for (int i = 0; i < n; i++) {
            assertThat(seqs.get(i)).isEqualTo(i + 1L);
        }
    }

    @Test
    void concurrentReadsOfALimitedGrantNeverExceedMaxReads() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.sizes.shoe", "43", "PERSONAL");
        Access a = grantAccess(owner, 3600, 5, null, "profile.sizes:read");
        ExecutorService pool = Executors.newFixedThreadPool(8);
        int ok = 0;
        int denied = 0;
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < 20; i++) {
                results.add(pool.submit(() -> readData(a.accessToken(), null).andReturn().getResponse().getStatus()));
            }
            for (Future<Integer> f : results) {
                int s = f.get();
                if (s == 200) {
                    ok++;
                } else if (s == 403) {
                    denied++;
                }
            }
        } finally {
            pool.shutdownNow();
        }
        assertThat(ok).isEqualTo(5);
        assertThat(denied).isEqualTo(15);
        ownerGet(owner, "/v1/owner/audit/verify").andExpect(jsonPath("$.valid").value(true));
    }
}
