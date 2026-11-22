package com.personalplatform.treasury;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.personalplatform.treasury.approval.ApprovalService;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MvcResult;

class ApprovalTest extends AbstractIntegrationTest {

    private static final long THRESHOLD = 10_000;

    @Autowired ApprovalService approvals;

    private record Setup(Household h, String approver, String member) {}

    private Setup setup() throws Exception {
        Household h = newHousehold(uid("owner"), THRESHOLD);
        String approver = uid("approver");
        String member = uid("member");
        addMember(h, approver, "APPROVER");
        addMember(h, member, "MEMBER");
        deposit(h, 100_000);
        return new Setup(h, approver, member);
    }

    private String pendingSpend(Setup s, String by, long amount) throws Exception {
        MvcResult r = post("/v1/households/" + s.h().id() + "/spends", by, key(), spendBody(null, amount))
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.status").value("PENDING_APPROVAL"))
                .andExpect(jsonPath("$.entry").doesNotExist()).andReturn();
        return read(r, "$.approval.id");
    }

    @Test
    void thresholdBoundaryAmountEqualToThresholdPostsImmediatelyOneMoreNeedsApproval() throws Exception {
        Setup s = setup();
        long entries = entryCount(s.h().id());
        post("/v1/households/" + s.h().id() + "/spends", s.member(), key(), spendBody(null, THRESHOLD))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("POSTED"));
        assertThat(entryCount(s.h().id())).isEqualTo(entries + 1);
        assertThat(balance(s.h(), s.h().pool())).isEqualTo(90_000);

        pendingSpend(s, s.member(), THRESHOLD + 1);
        // pending = no ledger entry, no balance change
        assertThat(entryCount(s.h().id())).isEqualTo(entries + 1);
        assertThat(balance(s.h(), s.h().pool())).isEqualTo(90_000);
    }

    @Test
    void requesterCannotApproveTheirOwnRequestEvenWithAnApproverRole() throws Exception {
        Setup s = setup();
        String id = pendingSpend(s, s.approver(), 20_000);
        post("/v1/households/" + s.h().id() + "/approvals/" + id + "/approve", s.approver(), key(), null)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("SELF_APPROVAL"));
        assertThat(balance(s.h(), s.h().pool())).isEqualTo(100_000);
    }

    @Test
    void plainMembersCannotApprove() throws Exception {
        Setup s = setup();
        String id = pendingSpend(s, s.member(), 20_000);
        post("/v1/households/" + s.h().id() + "/approvals/" + id + "/approve", s.member(), key(), null)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ROLE_NOT_ALLOWED"));
    }

    @Test
    void approvalByAnotherApproverPostsTheEntryAtomicallyAndIsIdempotent() throws Exception {
        Setup s = setup();
        String id = pendingSpend(s, s.member(), 25_000);
        String k = key();
        MvcResult done = post("/v1/households/" + s.h().id() + "/approvals/" + id + "/approve", s.approver(), k, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.decidedByUid").value(s.approver())).andReturn();
        String entryId = read(done, "$.entryId");
        assertThat(balance(s.h(), s.h().pool())).isEqualTo(75_000);
        assertThat(balance(s.h(), s.h().expense())).isEqualTo(25_000);
        get("/v1/households/" + s.h().id() + "/entries/" + entryId, s.h().owner()).andExpect(jsonPath("$.approvalId").value(id));

        post("/v1/households/" + s.h().id() + "/approvals/" + id + "/approve", s.approver(), k, null)
                .andExpect(status().isOk()).andExpect(header().string("Idempotent-Replayed", "true"));
        post("/v1/households/" + s.h().id() + "/approvals/" + id + "/approve", s.h().owner(), key(), null)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_DECIDED"));
        assertThat(balance(s.h(), s.h().pool())).isEqualTo(75_000);
    }

    @Test
    void rejectionClosesTheRequestWithoutPostingAnything() throws Exception {
        Setup s = setup();
        String id = pendingSpend(s, s.member(), 30_000);
        post("/v1/households/" + s.h().id() + "/approvals/" + id + "/reject", s.approver(), key(), Map.of("note", "too much"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.decisionNote").value("too much"));
        post("/v1/households/" + s.h().id() + "/approvals/" + id + "/approve", s.h().owner(), key(), null)
                .andExpect(status().isConflict());
        assertThat(balance(s.h(), s.h().pool())).isEqualTo(100_000);
        get("/v1/households/" + s.h().id() + "/approvals?status=REJECTED", s.h().owner()).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void requestExpiresExactlyAtItsDeadline() throws Exception {
        Setup s = setup(); // expiry is 48h
        String id = pendingSpend(s, s.member(), 20_000);

        clock.advance(Duration.ofHours(48).minusSeconds(1));
        get("/v1/households/" + s.h().id() + "/approvals/" + id, s.approver()).andExpect(jsonPath("$.status").value("PENDING_APPROVAL"));

        clock.advance(Duration.ofSeconds(1)); // now == expires_at -> expired
        get("/v1/households/" + s.h().id() + "/approvals/" + id, s.approver()).andExpect(jsonPath("$.status").value("EXPIRED"));
        post("/v1/households/" + s.h().id() + "/approvals/" + id + "/approve", s.approver(), key(), null)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("APPROVAL_EXPIRED"));
        assertThat(balance(s.h(), s.h().pool())).isEqualTo(100_000);

        assertThat(approvals.expireDue()).isGreaterThanOrEqualTo(1);
        assertThat(dsl.fetchValue("select status from treasury.approval_requests where id = ?::uuid", id)).isEqualTo("EXPIRED");
        post("/v1/households/" + s.h().id() + "/approvals/" + id + "/reject", s.approver(), key(), null).andExpect(status().isConflict());
    }

    @Test
    void approvingWithoutFundsFailsAndLeavesTheRequestPending() throws Exception {
        Setup s = setup();
        String id = pendingSpend(s, s.member(), 20_000);
        // drain the pool below the requested amount via a within-threshold spend series
        for (int i = 0; i < 9; i++) {
            post("/v1/households/" + s.h().id() + "/spends", s.h().owner(), key(), spendBody(null, 9_000)).andExpect(status().isCreated());
        }
        assertThat(balance(s.h(), s.h().pool())).isEqualTo(19_000);
        post("/v1/households/" + s.h().id() + "/approvals/" + id + "/approve", s.approver(), key(), null)
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INSUFFICIENT_FUNDS"));
        get("/v1/households/" + s.h().id() + "/approvals/" + id, s.approver()).andExpect(jsonPath("$.status").value("PENDING_APPROVAL"));
    }

    /** The dashboard's pending list per role: owners and approvers see every open request, a kid sees only their own. */
    @Test
    void thePendingListShowsExactlyTheOpenRequestsEachRoleMayAct() throws Exception {
        Setup s = setup();
        String kid = uid("kid");
        UUID kidPot = addMember(s.h(), kid, "KID"); // a kid only ever spends from their own pot
        String memberRequest = pendingSpend(s, s.member(), 20_000);
        MvcResult kidSpend = post("/v1/households/" + s.h().id() + "/spends", kid, key(), spendBody(kidPot, 30_000))
                .andExpect(status().isAccepted())
                .andReturn();
        String kidRequest = read(kidSpend, "$.approval.id");

        String pending = "/v1/households/" + s.h().id() + "/approvals?status=PENDING_APPROVAL";
        get(pending, s.h().owner()).andExpect(jsonPath("$.length()").value(2));
        get(pending, s.approver()).andExpect(jsonPath("$.length()").value(2));
        get(pending, s.member()).andExpect(jsonPath("$.length()").value(2));
        get(pending, kid).andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(kidRequest));
        assertThat(memberRequest).isNotEqualTo(kidRequest);

        // a decided request leaves every role's pending list
        post("/v1/households/" + s.h().id() + "/approvals/" + memberRequest + "/reject", s.approver(), key(), null)
                .andExpect(status().isOk());
        get(pending, s.approver()).andExpect(jsonPath("$.length()").value(1));
        get(pending, kid).andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void thresholdIsConfigurableAndCanBeDisabledByOwnersOnly() throws Exception {
        Setup s = setup();
        put(s, s.member(), THRESHOLD, 403);
        put(s, s.h().owner(), null, 200);
        post("/v1/households/" + s.h().id() + "/spends", s.member(), key(), spendBody(null, 50_000)).andExpect(status().isCreated());
    }

    private void put(Setup s, String as, Long threshold, int expected) throws Exception {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("approvalThresholdMinor", threshold);
        body.put("approvalExpiryHours", 24);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/v1/households/" + s.h().id() + "/settings")
                        .header("Authorization", bearer(as)).contentType("application/json").content(json.writeValueAsString(body)))
                .andExpect(status().is(expected));
    }
}
