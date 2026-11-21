package com.personalplatform.legacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.legacy.protocol.ChannelType;
import com.personalplatform.legacy.protocol.Urgency;
import com.personalplatform.legacy.support.LegacyIntegrationBase;
import com.personalplatform.legacy.support.RecordingChannels.Sent;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** The protocol end to end through the API with a fake clock: transitions, check-in, quorum edge cases, delivery. */
class ProtocolFlowTest extends LegacyIntegrationBase {

    private String path(String p) {
        return "/v1/legacy/vault" + p;
    }

    private Instant instant(String uid, String jsonPath) throws Exception {
        return Instant.parse(read(oGet(uid, path("/state")), jsonPath));
    }

    private int approvals(String uid) throws Exception {
        return ((Number) read(oGet(uid, path("/state")), "$.quorum.approved")).intValue();
    }

    // ---- state machine through the scheduler ----------------------------------------------------------

    @Test
    void silenceWalksTheWholeLadderAndTimersAreDurable() throws Exception {
        Team team = setupTeam(uniqueUid("ladder"), 3, 2, true);
        Instant armedAt = clock.instant();
        assertThat(state(team.uid)).isEqualTo("ACTIVE");
        assertThat(instant(team.uid, "$.nextActionAt")).isEqualTo(armedAt.plusSeconds(7 * D)); // stored in the DB

        clock.set(armedAt.plusSeconds(7 * D - 1));
        tick();
        assertThat(state(team.uid)).isEqualTo("ACTIVE");

        fireNextTimer(team.uid);
        assertThat(state(team.uid)).isEqualTo("GRACE");
        assertThat(instant(team.uid, "$.nextActionAt")).isEqualTo(armedAt.plusSeconds(9 * D));
        fireNextTimer(team.uid);
        // entering ESCALATING also runs step 0 (offset 0) in the same pass
        assertThat(state(team.uid)).isEqualTo("ESCALATING");
        oGet(team.uid, path("/state")).andExpect(jsonPath("$.escalation.stepsExecuted").value(1));
        fireNextTimer(team.uid);
        oGet(team.uid, path("/state")).andExpect(jsonPath("$.escalation.stepsExecuted").value(2));
        fireNextTimer(team.uid);
        oGet(team.uid, path("/state")).andExpect(jsonPath("$.escalation.stepsExecuted").value(3));
        fireNextTimer(team.uid);
        assertThat(state(team.uid)).isEqualTo("RELEASE_PENDING");
        assertThat(instant(team.uid, "$.stateEnteredAt")).isEqualTo(armedAt.plusSeconds(12 * D));
        oGet(team.uid, path("/state")).andExpect(jsonPath("$.nextActionAt").doesNotExist()); // waits for quorum

        // pings got more urgent, never less, and went to the audiences the schedule names
        List<Sent> sent = channels.sentFor(team.vaultId);
        List<Urgency> urgencies = sent.stream().map(s -> s.message().urgency()).toList();
        assertThat(urgencies).isSortedAccordingTo(java.util.Comparator.naturalOrder());
        assertThat(urgencies).contains(Urgency.NOTICE, Urgency.WARNING, Urgency.URGENT, Urgency.FINAL);
        long trusteeBeforePending = sent.stream().filter(s -> s.message().recipientKind().equals("TRUSTEE")
                && s.message().urgency() != Urgency.FINAL).count();
        assertThat(trusteeBeforePending).isEqualTo(6); // steps 1 and 2 are audience ALL: 3 trustees each
        assertThat(sent.stream().filter(s -> s.message().urgency() == Urgency.NOTICE)
                .allMatch(s -> s.message().recipientKind().equals("OWNER"))).isTrue();
        // step 0 prefers PUSH then EMAIL for the owner; the PUSH contact is used
        assertThat(sent.stream().filter(s -> s.message().urgency() == Urgency.NOTICE)
                .map(Sent::channel).distinct().toList()).containsExactly(ChannelType.PUSH);
        // no message ever carries anything but fixed text
        assertThat(sent).allSatisfy(s -> assertThat(s.message().body() + s.message().subject())
                .doesNotContain("TOP-SECRET").doesNotContain(team.trustees.get(0).token()));
    }

    @Test
    void escalationStepsAreRecordedExactlyOncePerIncident() throws Exception {
        Team team = setupTeam(uniqueUid("steps"), 2, 2, true);
        driveToReleasePending(team);
        int rows = dsl.fetchCount(com.personalplatform.sql.jooq.legacy.legacy.Tables.ESCALATION_STEPS,
                com.personalplatform.sql.jooq.legacy.legacy.Tables.ESCALATION_STEPS.VAULT_ID.eq(team.vaultId));
        assertThat(rows).isEqualTo(3);
        int before = channels.sentFor(team.vaultId).size();
        for (int i = 0; i < 5; i++) {
            tick(); // idempotent: nothing more is due
        }
        assertThat(channels.sentFor(team.vaultId)).hasSize(before);
        assertThat(oGet(team.uid, path("/timeline?limit=500")).andReturn().getResponse().getContentAsString())
                .satisfies(t -> assertThat((List<?>) JsonPath.read(t, "$[?(@.eventType=='ESCALATION_STEP_EXECUTED')]")).hasSize(3));
    }

    @Test
    void ownerCheckInReturnsToActiveFromEveryNonTerminalStateAndRestartsTheClock() throws Exception {
        for (String target : List.of("ACTIVE", "GRACE", "ESCALATING", "RELEASE_PENDING")) {
            Team team = setupTeam(uniqueUid("ci-" + target.toLowerCase()), 2, 2, true);
            while (!state(team.uid).equals(target)) {
                fireNextTimer(team.uid);
            }
            if (target.equals("RELEASE_PENDING")) {
                vote(team.trustees.get(0), "APPROVE");
            }
            Instant now = clock.instant();
            oPost(team.uid, path("/checkin"), null).andExpect(status().isOk())
                    .andExpect(jsonPath("$.state").value("ACTIVE"))
                    .andExpect(jsonPath("$.escalation.stepsExecuted").value(0))
                    .andExpect(jsonPath("$.quorum.approved").value(0))
                    .andExpect(jsonPath("$.nextDueAt").value(now.plusSeconds(7 * D).toString()));
            tick();
            assertThat(state(team.uid)).as("after check-in from %s", target).isEqualTo("ACTIVE");
            List<String> types = JsonPath.read(body(oGet(team.uid, path("/timeline?limit=500"))), "$[*].eventType");
            assertThat(types).contains("CHECK_IN");
        }
    }

    @Test
    void checkInIsRejectedOnceReleased() throws Exception {
        Team team = setupTeam(uniqueUid("late"), 2, 2, true);
        driveToReleasePending(team);
        vote(team.trustees.get(0), "APPROVE");
        vote(team.trustees.get(1), "APPROVE");
        fireNextTimer(team.uid);
        assertThat(state(team.uid)).isEqualTo("RELEASED");
        oPost(team.uid, path("/checkin"), null).andExpect(status().isConflict());
        oPost(team.uid, path("/pause"), Map.of("durationSeconds", D)).andExpect(status().isConflict());
        oPost(team.uid, path("/disarm"), null).andExpect(status().isConflict());
        oPut(team.uid, path("/policy"), policy(2)).andExpect(status().isConflict());
    }

    @Test
    void longSchedulerOutageDoesNotBurnTheOwnersTimeBudget() throws Exception {
        Team team = setupTeam(uniqueUid("outage"), 2, 2, true);
        clock.advance(Duration.ofDays(60)); // the scheduler was down for two months
        tick();
        assertThat(state(team.uid)).isEqualTo("GRACE"); // not RELEASE_PENDING: the owner still gets the full ladder
        Instant graceStart = instant(team.uid, "$.stateEnteredAt");
        assertThat(graceStart).isEqualTo(clock.instant());
    }

    @Test
    void unarmedVaultsNeverMove() throws Exception {
        Team team = setupTeam(uniqueUid("unarmed"), 2, 2, false);
        clock.advance(Duration.ofDays(400));
        tick();
        assertThat(state(team.uid)).isEqualTo("ACTIVE");
        oPost(team.uid, path("/arm"), null).andExpect(status().isOk());
        oPost(team.uid, path("/disarm"), null).andExpect(status().isOk()).andExpect(jsonPath("$.armed").value(false))
                .andExpect(jsonPath("$.nextActionAt").doesNotExist());
    }

    // ---- quorum ---------------------------------------------------------------------------------------

    @Test
    void quorumOfOneNeedsOneApprovalButStillWaitsOutTheCoolOff() throws Exception {
        Team team = setupTeam(uniqueUid("t1"), 3, 1, true);
        driveToReleasePending(team);
        tick();
        assertThat(state(team.uid)).isEqualTo("RELEASE_PENDING");
        vote(team.trustees.get(2), "APPROVE");
        Instant reached = clock.instant();
        oGet(team.uid, path("/state")).andExpect(jsonPath("$.quorum.approved").value(1))
                .andExpect(jsonPath("$.quorum.releaseNotBefore").value(reached.plusSeconds(2 * D).toString()));
        clock.set(reached.plusSeconds(2 * D - 1));
        tick();
        assertThat(state(team.uid)).isEqualTo("RELEASE_PENDING");
        clock.set(reached.plusSeconds(2 * D));
        tick();
        assertThat(state(team.uid)).isEqualTo("RELEASED");
    }

    @Test
    void quorumOfAllRequiresEveryTrustee() throws Exception {
        Team team = setupTeam(uniqueUid("tn"), 3, 3, true);
        driveToReleasePending(team);
        vote(team.trustees.get(0), "APPROVE");
        vote(team.trustees.get(1), "APPROVE");
        clock.advance(Duration.ofDays(30));
        tick();
        assertThat(state(team.uid)).isEqualTo("RELEASE_PENDING"); // 2 of 3 is not enough, however long we wait
        vote(team.trustees.get(2), "APPROVE");
        clock.advance(Duration.ofDays(2));
        tick();
        assertThat(state(team.uid)).isEqualTo("RELEASED");
    }

    @Test
    void oneTrusteeAloneCanNeverTriggerReleaseOfATwoOfThree() throws Exception {
        Team team = setupTeam(uniqueUid("alone"), 3, 2, true);
        driveToReleasePending(team);
        vote(team.trustees.get(0), "APPROVE");
        clock.advance(Duration.ofDays(365));
        tick();
        assertThat(state(team.uid)).isEqualTo("RELEASE_PENDING");
        tGet(team.trustees.get(0).token(), "/v1/legacy/trustee/share").andExpect(status().isConflict());
    }

    @Test
    void duplicateApprovalsDoNotInflateTheQuorum() throws Exception {
        Team team = setupTeam(uniqueUid("dup"), 3, 2, true);
        driveToReleasePending(team);
        for (int i = 0; i < 5; i++) {
            vote(team.trustees.get(0), "APPROVE");
        }
        assertThat(approvals(team.uid)).isEqualTo(1);
        tPostVote(team, 0, "APPROVE").andExpect(jsonPath("$.changed").value(false));
        clock.advance(Duration.ofDays(30));
        tick();
        assertThat(state(team.uid)).isEqualTo("RELEASE_PENDING");
        assertThat(dsl.fetchCount(com.personalplatform.sql.jooq.legacy.legacy.Tables.APPROVALS,
                com.personalplatform.sql.jooq.legacy.legacy.Tables.APPROVALS.VAULT_ID.eq(team.vaultId))).isEqualTo(1);
    }

    private org.springframework.test.web.servlet.ResultActions tPostVote(Team team, int i, String decision)
            throws Exception {
        return tPost(team.trustees.get(i).token(), "/v1/legacy/trustee/approval", Map.of("decision", decision));
    }

    @Test
    void declineWithdrawsApprovalAndRestartsTheCoolOff() throws Exception {
        Team team = setupTeam(uniqueUid("decline"), 2, 1, true);
        driveToReleasePending(team);
        vote(team.trustees.get(0), "APPROVE");
        clock.advance(Duration.ofDays(1));
        vote(team.trustees.get(0), "DECLINE");
        oGet(team.uid, path("/state")).andExpect(jsonPath("$.quorum.approved").value(0))
                .andExpect(jsonPath("$.quorum.declined").value(1));
        clock.advance(Duration.ofDays(10));
        tick();
        assertThat(state(team.uid)).isEqualTo("RELEASE_PENDING");
        vote(team.trustees.get(0), "APPROVE"); // changes their mind
        Instant again = clock.instant();
        clock.set(again.plusSeconds(2 * D - 1));
        tick();
        assertThat(state(team.uid)).isEqualTo("RELEASE_PENDING"); // cool-off restarted from the new quorum
        clock.set(again.plusSeconds(2 * D));
        tick();
        assertThat(state(team.uid)).isEqualTo("RELEASED");
    }

    @Test
    void ownerCheckInInsideTheCoolOffCancelsReleaseAndInvalidatesApprovals() throws Exception {
        Team team = setupTeam(uniqueUid("cancel"), 3, 2, true);
        driveToReleasePending(team);
        vote(team.trustees.get(0), "APPROVE");
        vote(team.trustees.get(1), "APPROVE");
        Instant reached = clock.instant();
        clock.set(reached.plusSeconds(2 * D - 1));
        oPost(team.uid, path("/checkin"), null).andExpect(status().isOk()); // one tap, one second before release
        clock.set(reached.plusSeconds(5 * D));
        tick();
        assertThat(state(team.uid)).isEqualTo("ACTIVE");
        // approval after cancel is refused ...
        tPostVote(team, 2, "APPROVE").andExpect(status().isConflict());
        tGet(team.trustees.get(0).token(), "/v1/legacy/trustee/share").andExpect(status().isConflict());
        // ... and the old approvals do not count towards the NEXT incident
        driveToReleasePending(team);
        assertThat(approvals(team.uid)).isZero();
        tGet(team.trustees.get(0).token(), "/v1/legacy/trustee/me").andExpect(jsonPath("$.myDecision").doesNotExist());
        vote(team.trustees.get(2), "APPROVE");
        clock.advance(Duration.ofDays(30));
        tick();
        assertThat(state(team.uid)).isEqualTo("RELEASE_PENDING"); // 1 fresh approval < quorum 2
        oGet(team.uid, path("/state")).andExpect(jsonPath("$.epoch").value(2));
    }

    @Test
    void checkInRacingTheReleaseTickWinsWhenItHoldsTheRowLockFirst() throws Exception {
        // Release only exists once the scheduler commits RELEASED; a check-in that commits first always cancels.
        Team team = setupTeam(uniqueUid("race"), 2, 2, true);
        driveToReleasePending(team);
        vote(team.trustees.get(0), "APPROVE");
        vote(team.trustees.get(1), "APPROVE");
        clock.advance(Duration.ofDays(2)); // release is now due but has not been ticked yet
        oPost(team.uid, path("/checkin"), null).andExpect(status().isOk());
        tick();
        assertThat(state(team.uid)).isEqualTo("ACTIVE");
    }

    @Test
    void votingRequiresHoldingAShareOfTheCurrentKey() throws Exception {
        // 3 trustees, quorum 2, but one never gets a share: they cannot vote
        String uid = uniqueUid("noshare");
        Team team = setupTeam(uid, 2, 2, false);
        var invite = body(oPost(uid, path("/trustees"), Map.of("label", "Late joiner")));
        String token = JsonPath.read(invite, "$.inviteToken");
        var keys = com.personalplatform.legacy.support.ClientCrypto.generateX25519();
        String accepted = body(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .post("/v1/legacy/trustee/accept").contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("inviteToken", token, "keyAlgorithm", "X25519",
                        "publicKey", keys.publicKeyB64(),
                        "contacts", List.of(Map.of("channel", "EMAIL", "address", "late@example.com")))))));
        String lateToken = JsonPath.read(accepted, "$.accessToken");
        oPost(uid, path("/arm"), null).andExpect(status().isOk());
        driveToReleasePending(team);
        tPost(lateToken, "/v1/legacy/trustee/approval", Map.of("decision", "APPROVE")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(containsString("share")));
        assertThat(approvals(uid)).isZero();
    }

    // ---- delivery -------------------------------------------------------------------------------------

    @Test
    void failedChannelFallsBackToTheNextContact() throws Exception {
        Team team = setupTeam(uniqueUid("fallback"), 2, 2, true);
        channels.failChannel(ChannelType.PUSH);
        fireNextTimer(team.uid); // GRACE: owner is nudged on all channels, PUSH first
        List<Sent> sent = channels.sentFor(team.vaultId);
        assertThat(sent).hasSize(1);
        assertThat(sent.get(0).channel()).isEqualTo(ChannelType.EMAIL);
        assertThat(sent.get(0).address()).isEqualTo("owner@example.com");
        assertThat(channels.attempts()).contains(ChannelType.PUSH, ChannelType.EMAIL);
        List<Map<String, Object>> events = JsonPath.read(body(oGet(team.uid, path("/timeline?limit=50"))),
                "$[?(@.eventType=='NOTIFICATION_SENT')].detail");
        assertThat(events.get(0)).containsEntry("fallbacksTried", 1).containsEntry("channel", "EMAIL");
    }

    @Test
    void totalOutageIsRetriedWithBackoffThenGivenUpAndAudited() throws Exception {
        Team team = setupTeam(uniqueUid("outagechan"), 2, 2, true);
        for (ChannelType t : ChannelType.values()) {
            channels.failChannel(t);
        }
        fireNextTimer(team.uid); // GRACE; the owner notification fails everywhere
        assertThat(channels.sentFor(team.vaultId)).isEmpty();
        String status = (String) dsl.fetchValue("select status from legacy.notification_outbox where vault_id = ?", team.vaultId);
        assertThat(status).isEqualTo("PENDING");
        // not retried before the backoff has passed
        int attemptsBefore = channels.attempts().size();
        dispatcher.dispatchPending(10);
        assertThat(channels.attempts()).hasSize(attemptsBefore);
        // retry with exponential backoff until the attempt limit
        for (int i = 0; i < 6; i++) {
            clock.advance(Duration.ofHours(12));
            dispatcher.dispatchPending(10);
        }
        assertThat((String) dsl.fetchValue("select status from legacy.notification_outbox where vault_id = ?", team.vaultId))
                .isEqualTo("FAILED");
        assertThat((Integer) dsl.fetchValue("select attempts from legacy.notification_outbox where vault_id = ?", team.vaultId))
                .isEqualTo(5);
        List<String> types = JsonPath.read(body(oGet(team.uid, path("/timeline?limit=100"))), "$[*].eventType");
        assertThat(types).contains("NOTIFICATION_FAILED");
        // the protocol itself kept going regardless of delivery problems
        assertThat(state(team.uid)).isEqualTo("GRACE");
    }

    @Test
    void ownerReturnedNoticeGoesToTrusteesWhenReleaseIsCancelled() throws Exception {
        Team team = setupTeam(uniqueUid("returned"), 2, 2, true);
        driveToReleasePending(team);
        oPost(team.uid, path("/checkin"), null).andExpect(status().isOk());
        tick();
        long returned = channels.sentFor(team.vaultId).stream()
                .filter(s -> s.message().kind().name().equals("OWNER_RETURNED")).count();
        assertThat(returned).isEqualTo(2);
    }
}
