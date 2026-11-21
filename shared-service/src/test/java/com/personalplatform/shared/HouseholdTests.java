package com.personalplatform.shared;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class HouseholdTests extends AbstractIntegrationTest {

    @Test
    void creatorBecomesOwnerAndSeesHousehold() throws Exception {
        String alice = uid("alice");
        UUID h = createHousehold(alice, "Home");
        getAs(alice, "/v1/households").andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].role").value("OWNER"));
        getAs(alice, "/v1/households/" + h).andExpect(status().isOk())
                .andExpect(jsonPath("$.members", hasSize(1)))
                .andExpect(jsonPath("$.members[0].uid").value(alice));
        getAs(alice, "/v1/households/" + h + "/membership").andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("OWNER"));
    }

    @Test
    void blankNameIsRejected() throws Exception {
        postAs(uid("alice"), "/v1/households", "{\"name\":\"  \"}").andExpect(status().isBadRequest());
    }

    @Test
    void inviteCodeJoinsAsMemberAndIsStoredHashed() throws Exception {
        String alice = uid("alice"), bob = uid("bob");
        UUID h = createHousehold(alice, "Home");
        String code = createInvite(alice, h);

        postAs(bob, "/v1/invites/accept", "{\"code\":\"" + code + "\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("MEMBER"));
        getAs(bob, "/v1/households/" + h + "/membership").andExpect(jsonPath("$.role").value("MEMBER"));
        getAs(alice, "/v1/households/" + h).andExpect(jsonPath("$.members", hasSize(2)));

        assertThat(dsl.fetchValue("select count(*) from shared.household_invites where code_hash = ?", code))
                .isEqualTo(0L);
    }

    @Test
    void inviteCodeIsSingleUse() throws Exception {
        String alice = uid("alice"), bob = uid("bob"), carol = uid("carol");
        UUID h = createHousehold(alice, "Home");
        String code = createInvite(alice, h);

        postAs(bob, "/v1/invites/accept", "{\"code\":\"" + code + "\"}").andExpect(status().isOk());
        postAs(carol, "/v1/invites/accept", "{\"code\":\"" + code + "\"}").andExpect(status().isGone());
        getAs(carol, "/v1/households/" + h).andExpect(status().isNotFound());
    }

    @Test
    void inviteCodeIsSingleUseUnderConcurrentRedemption() throws Exception {
        String alice = uid("alice");
        UUID h = createHousehold(alice, "Home");
        String code = createInvite(alice, h);
        int contenders = 8;
        ExecutorService pool = Executors.newFixedThreadPool(contenders);
        CountDownLatch go = new CountDownLatch(1);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < contenders; i++) {
                String uid = uid("racer" + i);
                Callable<Integer> task = () -> {
                    go.await();
                    return postAs(uid, "/v1/invites/accept", "{\"code\":\"" + code + "\"}")
                            .andReturn().getResponse().getStatus();
                };
                results.add(pool.submit(task));
            }
            go.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> f : results) {
                statuses.add(f.get(30, TimeUnit.SECONDS));
            }
            assertThat(statuses.stream().filter(s -> s == 200).count()).isEqualTo(1);
            assertThat(statuses.stream().filter(s -> s == 410).count()).isEqualTo(contenders - 1);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void inviteCodeExpires() throws Exception {
        String alice = uid("alice"), bob = uid("bob");
        UUID h = createHousehold(alice, "Home");
        String code = read(postAs(alice, "/v1/households/" + h + "/invites", "{\"ttlHours\":2}"), "$.code");

        clock.advance(Duration.ofHours(2).plusSeconds(1));
        postAs(bob, "/v1/invites/accept", "{\"code\":\"" + code + "\"}").andExpect(status().isGone());
        getAs(bob, "/v1/households/" + h).andExpect(status().isNotFound());
    }

    @Test
    void inviteIsStillValidJustBeforeExpiry() throws Exception {
        String alice = uid("alice"), bob = uid("bob");
        UUID h = createHousehold(alice, "Home");
        String code = read(postAs(alice, "/v1/households/" + h + "/invites", "{\"ttlHours\":2}"), "$.code");
        clock.advance(Duration.ofHours(2).minusSeconds(1));
        postAs(bob, "/v1/invites/accept", "{\"code\":\"" + code + "\"}").andExpect(status().isOk());
    }

    @Test
    void existingMemberRedeemingDoesNotBurnTheCode() throws Exception {
        String alice = uid("alice"), bob = uid("bob");
        UUID h = createHousehold(alice, "Home");
        String code = createInvite(alice, h);

        postAs(alice, "/v1/invites/accept", "{\"code\":\"" + code + "\"}").andExpect(status().isConflict());
        postAs(bob, "/v1/invites/accept", "{\"code\":\"" + code + "\"}").andExpect(status().isOk());
    }

    @Test
    void revokedInviteCannotBeRedeemed() throws Exception {
        String alice = uid("alice"), bob = uid("bob");
        UUID h = createHousehold(alice, "Home");
        var created = postAs(alice, "/v1/households/" + h + "/invites", "{}");
        String code = read(created, "$.code");
        String inviteId = read(created, "$.id");
        deleteAs(alice, "/v1/households/" + h + "/invites/" + inviteId).andExpect(status().isNoContent());
        postAs(bob, "/v1/invites/accept", "{\"code\":\"" + code + "\"}").andExpect(status().isGone());
    }

    @Test
    void unknownCodeIsGone() throws Exception {
        postAs(uid("bob"), "/v1/invites/accept", "{\"code\":\"nope\"}").andExpect(status().isGone());
    }

    @Test
    void onlyOwnersManageInvitesAndMembers() throws Exception {
        String alice = uid("alice"), bob = uid("bob"), carol = uid("carol");
        UUID h = createHousehold(alice, "Home");
        join(bob, h, alice);
        join(carol, h, alice);

        postAs(bob, "/v1/households/" + h + "/invites", "{}").andExpect(status().isForbidden());
        getAs(bob, "/v1/households/" + h + "/invites").andExpect(status().isForbidden());
        deleteAs(bob, "/v1/households/" + h + "/members/" + carol).andExpect(status().isForbidden());
        putAs(bob, "/v1/households/" + h + "/members/" + carol + "/role", "{\"role\":\"OWNER\"}")
                .andExpect(status().isForbidden());
        deleteAs(bob, "/v1/households/" + h).andExpect(status().isForbidden());

        deleteAs(alice, "/v1/households/" + h + "/members/" + carol).andExpect(status().isNoContent());
        getAs(carol, "/v1/households/" + h).andExpect(status().isNotFound());
    }

    @Test
    void lastOwnerCannotLeaveOrBeDemotedOrRemoved() throws Exception {
        String alice = uid("alice"), bob = uid("bob");
        UUID h = createHousehold(alice, "Home");
        join(bob, h, alice);

        postAs(alice, "/v1/households/" + h + "/leave", "").andExpect(status().isConflict());
        putAs(alice, "/v1/households/" + h + "/members/" + alice + "/role", "{\"role\":\"MEMBER\"}")
                .andExpect(status().isConflict());
        deleteAs(alice, "/v1/households/" + h + "/members/" + alice).andExpect(status().isConflict());

        // promote bob, then alice may leave
        putAs(alice, "/v1/households/" + h + "/members/" + bob + "/role", "{\"role\":\"OWNER\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("OWNER"));
        postAs(alice, "/v1/households/" + h + "/leave", "").andExpect(status().isNoContent());
        getAs(alice, "/v1/households/" + h).andExpect(status().isNotFound());

        // bob is now the last owner
        postAs(bob, "/v1/households/" + h + "/leave", "").andExpect(status().isConflict());
    }

    @Test
    void plainMemberCanLeave() throws Exception {
        String alice = uid("alice"), bob = uid("bob");
        UUID h = createHousehold(alice, "Home");
        join(bob, h, alice);
        postAs(bob, "/v1/households/" + h + "/leave", "").andExpect(status().isNoContent());
        getAs(bob, "/v1/households").andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void ownerCanDeleteHouseholdWithEverythingInIt() throws Exception {
        String alice = uid("alice");
        UUID h = createHousehold(alice, "Home");
        postAs(alice, "/v1/reminders", "{\"title\":\"t\",\"dueAt\":\"2026-02-01T00:00:00Z\",\"householdId\":\"" + h + "\"}")
                .andExpect(status().isCreated());
        deleteAs(alice, "/v1/households/" + h).andExpect(status().isNoContent());
        getAs(alice, "/v1/households/" + h).andExpect(status().isNotFound());
        assertThat(dsl.fetchCount(org.jooq.impl.DSL.table("shared.reminders"))).isZero();
    }
}
