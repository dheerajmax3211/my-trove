package com.personalplatform.waitingon;

import static com.personalplatform.waitingon.StubJwtConfig.bearer;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.waitingon.workflow.FollowUpResult;
import com.personalplatform.waitingon.workflow.FollowUpWorkflow;
import com.personalplatform.waitingon.workflow.Stage;
import io.temporal.client.WorkflowClient;
import io.temporal.testing.TestWorkflowEnvironment;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Full stack: HTTP -> services -> real Postgres (Testcontainers) -> real follow-up workflow + activities running on
 * Temporal's in-process time-skipping test server. "Days" pass by calling {@code temporal.sleep(...)}.
 */
@Import({TestcontainersConfiguration.class, StubJwtConfig.class, TestTemporalConfig.class})
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "app.inbound.secret=test-secret")
class WaitingOnApiTest {

    static final String SECRET = "test-secret";

    @Autowired MockMvc mvc;
    @Autowired TestWorkflowEnvironment temporal;
    @Autowired WorkflowClient workflowClient;
    @Autowired RecordingNotificationPort notifications;

    // ------------------------------------------------------------------ helpers

    private String create(String uid, String json) throws Exception {
        String body = mvc.perform(post("/v1/items").header("Authorization", bearer(uid))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    private static String itemJson(String title, String category, String plan) {
        return """
                {"title":"%s","counterparty":"Shop Ltd","counterpartyEmail":"help@shop.example",
                 "category":"%s","amount":120.50,"currency":"GBP","expectedBy":"%s"%s}
                """.formatted(title, category, LocalDate.now().plusDays(1), plan == null ? "" : ",\"plan\":" + plan);
    }

    private static final String FAST_PLAN =
            "{\"nudgeAfterDays\":2,\"escalateAfterDays\":5,\"finalNoticeAfterDays\":0,\"expireAfterDays\":10}";

    private ResultActions getItem(String uid, String id) throws Exception {
        return mvc.perform(get("/v1/items/" + id).header("Authorization", bearer(uid)));
    }

    private String field(String uid, String id, String jsonPath) throws Exception {
        String body = getItem(uid, id).andReturn().getResponse().getContentAsString();
        Object v = JsonPath.read(body, jsonPath);
        return v == null ? null : v.toString();
    }

    private List<String> timelineTypes(String uid, String id) throws Exception {
        String body = mvc.perform(get("/v1/items/" + id + "/timeline").header("Authorization", bearer(uid)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$[*].type");
    }

    /** Activities run on worker threads in real time even though workflow time is virtual: poll briefly. */
    private static void eventually(BooleanSupplier condition, String what) throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
        while (System.nanoTime() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            Thread.sleep(25);
        }
        throw new AssertionError("Timed out waiting for: " + what);
    }

    private void awaitStatus(String uid, String id, String expected) throws Exception {
        eventually(() -> {
            try {
                return expected.equals(field(uid, id, "$.status"));
            } catch (Exception e) {
                return false;
            }
        }, "status " + expected);
    }

    private String replyAddress(String uid, String id) throws Exception {
        return field(uid, id, "$.replyAddress");
    }

    private ResultActions webhook(String secretHeader, String to, String subject, String text, String messageId)
            throws Exception {
        var req = post("/v1/webhooks/inbound-email").contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"from":"support@shop.example","to":"Waiting <%s>","subject":"%s","text":"%s","messageId":%s}
                        """.formatted(to, subject, text, messageId == null ? "null" : "\"" + messageId + "\""));
        if (secretHeader != null) {
            req.header("X-Webhook-Secret", secretHeader);
        }
        return mvc.perform(req);
    }

    // ------------------------------------------------------------------ authentication

    @Test
    void requiresAuthenticationButHealthIsPublic() throws Exception {
        mvc.perform(get("/v1/items")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/items").header("Authorization", "Bearer garbage")).andExpect(status().isUnauthorized());
        mvc.perform(get("/actuator/health")).andExpect(status().isNotFound()); // health is served on the private management port only (ObservabilityExposureTest)
    }

    // ------------------------------------------------------------------ the whole lifecycle

    @Test
    void fullLifecycleNudgeEscalateExpire() throws Exception {
        String uid = "uid-lifecycle";
        String id = create(uid, itemJson("Headphones refund", "REFUND", FAST_PLAN));
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED");
        getItem(uid, id).andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.followUp.stage").value("AWAITING_NUDGE"))
                .andExpect(jsonPath("$.followUp.nextAction").value("NUDGE"))
                .andExpect(jsonPath("$.replyAddress", containsString("waiting+")));

        temporal.sleep(Duration.ofDays(3)); // nudge was due on day 2
        awaitStatus(uid, id, "NUDGED");
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED", "NUDGE_SENT");
        assertThat(notifications.nudges).anySatisfy(n -> {
            assertThat(n.itemId()).isEqualTo(UUID.fromString(id));
            assertThat(n.replyTo()).isEqualTo(replyAddressSync(uid, id));
            assertThat(n.subject()).isEqualTo("Following up: Headphones refund");
        });
        getItem(uid, id).andExpect(jsonPath("$.followUp.stage").value("NUDGED"))
                .andExpect(jsonPath("$.followUp.nextAction").value("ESCALATE"));

        temporal.sleep(Duration.ofDays(3)); // escalation due on day 5
        awaitStatus(uid, id, "ESCALATED");
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED", "NUDGE_SENT", "ESCALATION_DRAFTED");
        assertThat(notifications.ownerMessages).anySatisfy(m -> {
            assertThat(m.ownerUid()).isEqualTo(uid);
            assertThat(m.body()).contains("Consumer Rights Act 2015", "Shop Ltd", "Headphones refund");
        });
        // the drafted letter is stored on the (append-only) timeline
        mvc.perform(get("/v1/items/" + id + "/timeline").header("Authorization", bearer(uid)))
                .andExpect(jsonPath("$[2].detail", containsString("within 14 days")));

        temporal.sleep(Duration.ofDays(6)); // expiry on day 10
        awaitStatus(uid, id, "EXPIRED");
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED", "NUDGE_SENT", "ESCALATION_DRAFTED", "EXPIRED");
        getItem(uid, id).andExpect(jsonPath("$.closedAt").isNotEmpty())
                .andExpect(jsonPath("$.outcome", containsString("No resolution 10 days")))
                .andExpect(jsonPath("$.followUp").doesNotExist());
    }

    private String replyAddressSync(String uid, String id) throws Exception {
        return replyAddress(uid, id);
    }

    @Test
    void resolveThroughTheApiStopsTheWorkflowAndFurtherMessages() throws Exception {
        String uid = "uid-resolve";
        String id = create(uid, itemJson("Insurance claim", "CLAIM", FAST_PLAN));
        temporal.sleep(Duration.ofDays(3));
        awaitStatus(uid, id, "NUDGED");

        mvc.perform(post("/v1/items/" + id + "/resolve").header("Authorization", bearer(uid))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"outcome\":\"Paid 120.50 on 3 March\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RESOLVED"))
                .andExpect(jsonPath("$.outcome").value("Paid 120.50 on 3 March"));

        // the workflow finishes with the outcome and never escalates
        FollowUpResult result = workflowClient.newUntypedWorkflowStub(FollowUpWorkflow.workflowIdFor(UUID.fromString(id)))
                .getResult(FollowUpResult.class);
        assertThat(result.finalStage()).isEqualTo(Stage.RESOLVED);
        assertThat(result.outcome()).isEqualTo("Paid 120.50 on 3 March");
        temporal.sleep(Duration.ofDays(60));
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED", "NUDGE_SENT", "RESOLVED");

        mvc.perform(post("/v1/items/" + id + "/resolve").header("Authorization", bearer(uid)))
                .andExpect(status().isConflict());
        mvc.perform(post("/v1/items/" + id + "/snooze").header("Authorization", bearer(uid))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"days\":3}"))
                .andExpect(status().isConflict());
        mvc.perform(post("/v1/items/" + id + "/cancel").header("Authorization", bearer(uid)))
                .andExpect(status().isConflict());
    }

    @Test
    void resolveWithoutBodyIsAllowed() throws Exception {
        String uid = "uid-resolve-nobody";
        String id = create(uid, itemJson("Thing", "OTHER", null));
        mvc.perform(post("/v1/items/" + id + "/resolve").header("Authorization", bearer(uid)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.outcome").value("Resolved"));
    }

    @Test
    void snoozeThroughTheApiMovesTheNextActionAndTheTimeline() throws Exception {
        String uid = "uid-snooze";
        String id = create(uid, itemJson("Parcel", "DELIVERY", FAST_PLAN));
        var before = JsonPath.<String>read(getItem(uid, id).andReturn().getResponse().getContentAsString(),
                "$.followUp.nextActionAt");

        String body = mvc.perform(post("/v1/items/" + id + "/snooze").header("Authorization", bearer(uid))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"days\":4}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.followUp.snoozedDays").value(4))
                .andReturn().getResponse().getContentAsString();
        String after = JsonPath.read(body, "$.followUp.nextActionAt");
        assertThat(java.time.Instant.parse(after)).isEqualTo(java.time.Instant.parse(before).plus(Duration.ofDays(4)));
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED", "SNOOZED");

        temporal.sleep(Duration.ofDays(3)); // original nudge day 2 passes: nothing yet
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED", "SNOOZED");
        temporal.sleep(Duration.ofDays(4));
        awaitStatus(uid, id, "NUDGED");
    }

    @Test
    void cancelThroughTheApi() throws Exception {
        String uid = "uid-cancel";
        String id = create(uid, itemJson("Approval", "APPROVAL", FAST_PLAN));
        mvc.perform(post("/v1/items/" + id + "/cancel").header("Authorization", bearer(uid)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        FollowUpResult result = workflowClient.newUntypedWorkflowStub(FollowUpWorkflow.workflowIdFor(UUID.fromString(id)))
                .getResult(FollowUpResult.class);
        assertThat(result.finalStage()).isEqualTo(Stage.CANCELLED);
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED", "CANCELLED");
    }

    @Test
    void listFiltersByStatusAndIsOrderedByExpectedDate() throws Exception {
        String uid = "uid-list";
        String a = create(uid, itemJson("A", "OTHER", null));
        String b = create(uid, itemJson("B", "OTHER", null));
        mvc.perform(post("/v1/items/" + b + "/cancel").header("Authorization", bearer(uid))).andExpect(status().isOk());

        mvc.perform(get("/v1/items").header("Authorization", bearer(uid)))
                .andExpect(jsonPath("$.length()").value(2));
        mvc.perform(get("/v1/items?status=OPEN").header("Authorization", bearer(uid)))
                .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(a));
        mvc.perform(get("/v1/items?status=OPEN&status=CANCELLED").header("Authorization", bearer(uid)))
                .andExpect(jsonPath("$.length()").value(2));
        mvc.perform(get("/v1/items?status=BOGUS").header("Authorization", bearer(uid)))
                .andExpect(status().isBadRequest());
    }

    // ------------------------------------------------------------------ isolation

    @Test
    void userCannotSeeOrTouchAnotherUsersItems() throws Exception {
        String id = create("uid-alice", itemJson("Alice's refund", "REFUND", FAST_PLAN));
        String bob = bearer("uid-bob");

        mvc.perform(get("/v1/items/" + id).header("Authorization", bob)).andExpect(status().isNotFound());
        mvc.perform(get("/v1/items/" + id + "/timeline").header("Authorization", bob)).andExpect(status().isNotFound());
        mvc.perform(get("/v1/items/" + id + "/draft").header("Authorization", bob)).andExpect(status().isNotFound());
        mvc.perform(post("/v1/items/" + id + "/resolve").header("Authorization", bob)).andExpect(status().isNotFound());
        mvc.perform(post("/v1/items/" + id + "/cancel").header("Authorization", bob)).andExpect(status().isNotFound());
        mvc.perform(post("/v1/items/" + id + "/snooze").header("Authorization", bob)
                .contentType(MediaType.APPLICATION_JSON).content("{\"days\":2}")).andExpect(status().isNotFound());
        mvc.perform(get("/v1/items").header("Authorization", bob))
                .andExpect(jsonPath("$[*].id", not(hasItem(id))));

        // Alice's item is untouched and still shows no sign of Bob's attempts
        getItem("uid-alice", id).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("OPEN"));
        assertThat(timelineTypes("uid-alice", id)).containsExactly("CREATED");
        // and Bob did not just get a 403 oracle: a random id looks exactly the same
        mvc.perform(get("/v1/items/" + UUID.randomUUID()).header("Authorization", bob))
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------------ validation and drafts

    @Test
    void validationErrorsAreProblemDetails() throws Exception {
        String uid = bearer("uid-validation");
        mvc.perform(post("/v1/items").header("Authorization", uid).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"\",\"counterparty\":\"x\",\"category\":\"REFUND\",\"expectedBy\":\"2026-01-01\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
        mvc.perform(post("/v1/items").header("Authorization", uid).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"t\",\"counterparty\":\"x\",\"category\":\"NOPE\",\"expectedBy\":\"2026-01-01\"}"))
                .andExpect(status().isBadRequest());
        // amount without currency
        mvc.perform(post("/v1/items").header("Authorization", uid).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"t\",\"counterparty\":\"x\",\"category\":\"REFUND\",\"amount\":5,"
                                + "\"expectedBy\":\"2026-01-01\"}"))
                .andExpect(status().isBadRequest());
        // misordered plan
        mvc.perform(post("/v1/items").header("Authorization", uid).contentType(MediaType.APPLICATION_JSON)
                        .content(itemJson("t", "REFUND",
                                "{\"nudgeAfterDays\":9,\"escalateAfterDays\":5,\"finalNoticeAfterDays\":0,\"expireAfterDays\":10}")))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/v1/items/" + UUID.randomUUID() + "/snooze").header("Authorization", uid)
                .contentType(MediaType.APPLICATION_JSON).content("{\"days\":0}")).andExpect(status().isBadRequest());
        mvc.perform(post("/v1/items/" + UUID.randomUUID() + "/snooze").header("Authorization", uid)
                .contentType(MediaType.APPLICATION_JSON).content("{\"days\":91}")).andExpect(status().isBadRequest());
    }

    @Test
    void draftPreviewReturnsCategorySpecificLetters() throws Exception {
        String uid = "uid-draft";
        String claim = create(uid, itemJson("Water damage", "CLAIM", null));
        String delivery = create(uid, itemJson("Sofa", "DELIVERY", null));

        mvc.perform(get("/v1/items/" + claim + "/draft").header("Authorization", bearer(uid)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.tone").value("ESCALATION"))
                .andExpect(jsonPath("$.subject").value("Formal complaint: Water damage"))
                .andExpect(jsonPath("$.body", containsString("Ombudsman")))
                .andExpect(jsonPath("$.note", containsString("not legal advice")));
        mvc.perform(get("/v1/items/" + delivery + "/draft?tone=FINAL_NOTICE").header("Authorization", bearer(uid)))
                .andExpect(jsonPath("$.subject").value("FINAL NOTICE: Sofa"))
                .andExpect(jsonPath("$.body", containsString("30 days")));
        mvc.perform(get("/v1/items/" + delivery + "/draft?tone=SHOUTING").header("Authorization", bearer(uid)))
                .andExpect(status().isBadRequest());
        // previewing stores nothing
        assertThat(timelineTypes(uid, claim)).containsExactly("CREATED");
    }

    // ------------------------------------------------------------------ inbound webhook

    @Test
    void webhookRejectsMissingWrongOrUserTokens() throws Exception {
        String id = create("uid-hook-auth", itemJson("x", "OTHER", null));
        String to = replyAddress("uid-hook-auth", id);

        webhook(null, to, "Re", "paid", null).andExpect(status().isUnauthorized());
        webhook("wrong-secret", to, "Re", "paid", null).andExpect(status().isUnauthorized());
        webhook("", to, "Re", "paid", null).andExpect(status().isUnauthorized());
        webhook("test-secre", to, "Re", "paid", null).andExpect(status().isUnauthorized());
        webhook(SECRET + "x", to, "Re", "paid", null).andExpect(status().isUnauthorized());
        // a valid USER token is not a webhook credential
        mvc.perform(post("/v1/webhooks/inbound-email").header("Authorization", bearer("uid-hook-auth"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"to\":\"" + to + "\",\"text\":\"paid\"}"))
                .andExpect(status().isUnauthorized());
        // and nothing was recorded
        assertThat(timelineTypes("uid-hook-auth", id)).containsExactly("CREATED");
    }

    @Test
    void webhookSecretDoesNotOpenTheUserApi() throws Exception {
        mvc.perform(get("/v1/items").header("X-Webhook-Secret", SECRET)).andExpect(status().isUnauthorized());
    }

    @Test
    void unknownOrMalformedRecipientIsAcceptedButIgnored() throws Exception {
        webhook(SECRET, "waiting+00000000000000000000@reply.waiting-on.local", "Re", "paid", null)
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.matched").value(false));
        webhook(SECRET, "someone@example.com", "Re", "paid", null)
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.matched").value(false));
    }

    @Test
    void paidReplyResolvesTheItemThroughTheWorkflow() throws Exception {
        String uid = "uid-hook-paid";
        String id = create(uid, itemJson("Hotel refund", "REFUND", FAST_PLAN));
        temporal.sleep(Duration.ofDays(3));
        awaitStatus(uid, id, "NUDGED");

        webhook(SECRET, replyAddress(uid, id), "Re: Following up: Hotel refund",
                "Hi, your refund has been processed and will arrive in 3 days.", "msg-1@shop.example")
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.matched").value(true))
                .andExpect(jsonPath("$.applied").value(true)).andExpect(jsonPath("$.classification").value("PAID"))
                .andExpect(jsonPath("$.itemId").value(id));

        awaitStatus(uid, id, "RESOLVED");
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED", "NUDGE_SENT", "REPLY_RECEIVED", "RESOLVED");
        getItem(uid, id).andExpect(jsonPath("$.outcome", containsString("paid / approved")));
        mvc.perform(get("/v1/items/" + id + "/timeline").header("Authorization", bearer(uid)))
                .andExpect(jsonPath("$[2].summary", containsString("classified as PAID")));

        // the provider retries the same message: not applied twice
        webhook(SECRET, replyAddress(uid, id), "Re: Following up: Hotel refund", "refund has been processed",
                "msg-1@shop.example").andExpect(status().isAccepted()).andExpect(jsonPath("$.applied").value(false));
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED", "NUDGE_SENT", "REPLY_RECEIVED", "RESOLVED");
    }

    @Test
    void rejectedReplyEscalatesRightAway() throws Exception {
        String uid = "uid-hook-rejected";
        String id = create(uid, itemJson("Gym fee refund", "REFUND", FAST_PLAN));
        webhook(SECRET, replyAddress(uid, id), "Re", "We regret to inform you that your request was declined.", null)
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.classification").value("REJECTED"));
        awaitStatus(uid, id, "ESCALATED");
        temporal.sleep(Duration.ofSeconds(1));
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED", "REPLY_RECEIVED", "ESCALATION_DRAFTED");
    }

    @Test
    void needsInfoReplyDelaysTheSchedule() throws Exception {
        String uid = "uid-hook-info";
        String id = create(uid, itemJson("Claim", "CLAIM", FAST_PLAN));
        webhook(SECRET, replyAddress(uid, id), "Re", "Please send a copy of the invoice.", null)
                .andExpect(jsonPath("$.classification").value("NEEDS_INFO"));
        eventually(() -> {
            try {
                return "7".equals(field(uid, id, "$.followUp.snoozedDays"));
            } catch (Exception e) {
                return false;
            }
        }, "7 day hold");
        temporal.sleep(Duration.ofDays(4)); // nudge would have been day 2 without the hold
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED", "REPLY_RECEIVED");
    }

    @Test
    void unknownReplyIsRecordedWithoutChangingAnything() throws Exception {
        String uid = "uid-hook-unknown";
        String id = create(uid, itemJson("Thing", "OTHER", FAST_PLAN));
        webhook(SECRET, replyAddress(uid, id), "Out of office", "I am away until Monday.", null)
                .andExpect(jsonPath("$.classification").value("UNKNOWN"));
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED", "REPLY_RECEIVED");
        getItem(uid, id).andExpect(jsonPath("$.status").value("OPEN"));
    }

    @Test
    void replyToAClosedItemIsRecordedButNotApplied() throws Exception {
        String uid = "uid-hook-closed";
        String id = create(uid, itemJson("Thing", "OTHER", FAST_PLAN));
        mvc.perform(post("/v1/items/" + id + "/cancel").header("Authorization", bearer(uid))).andExpect(status().isOk());
        webhook(SECRET, replyAddress(uid, id), "Re", "refund has been processed", null)
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.applied").value(false));
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED", "CANCELLED", "REPLY_RECEIVED");
        getItem(uid, id).andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    // ------------------------------------------------------------------ owner pastes a reply (no inbound mail yet)

    private ResultActions pasteReply(String uid, String id, String text) throws Exception {
        return mvc.perform(post("/v1/items/" + id + "/replies").header("Authorization", bearer(uid))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"from\":\"Shop Ltd support\",\"subject\":\"Re: your refund\",\"text\":\"" + text + "\"}"));
    }

    @Test
    void pastedPaidReplyResolvesTheItemThroughTheWorkflow() throws Exception {
        String uid = "uid-paste-paid";
        String id = create(uid, itemJson("Pasted refund", "REFUND", FAST_PLAN));
        temporal.sleep(Duration.ofDays(3));
        awaitStatus(uid, id, "NUDGED");

        pasteReply(uid, id, "Your refund has been processed and will arrive in 3 days.")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.matched").value(true))
                .andExpect(jsonPath("$.applied").value(true))
                .andExpect(jsonPath("$.classification").value("PAID"));

        awaitStatus(uid, id, "RESOLVED");
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED", "NUDGE_SENT", "REPLY_RECEIVED", "RESOLVED");
        mvc.perform(get("/v1/items/" + id + "/timeline").header("Authorization", bearer(uid)))
                .andExpect(jsonPath("$[2].summary", containsString("Reply from Shop Ltd support")))
                .andExpect(jsonPath("$[2].detail", containsString("Your refund has been processed")));
    }

    @Test
    void pastedRefusalEscalatesAndPastedRequestForDocumentsHoldsTheSchedule() throws Exception {
        String refused = create("uid-paste-no", itemJson("Refused", "REFUND", FAST_PLAN));
        pasteReply("uid-paste-no", refused, "We regret to inform you that your request was declined.")
                .andExpect(jsonPath("$.classification").value("REJECTED"));
        awaitStatus("uid-paste-no", refused, "ESCALATED");

        String info = create("uid-paste-info", itemJson("Needs papers", "CLAIM", FAST_PLAN));
        pasteReply("uid-paste-info", info, "Please send a copy of the invoice.")
                .andExpect(jsonPath("$.classification").value("NEEDS_INFO"));
        eventually(() -> {
            try {
                return "7".equals(field("uid-paste-info", info, "$.followUp.snoozedDays"));
            } catch (Exception e) {
                return false;
            }
        }, "7 day hold after a request for documents");
    }

    @Test
    void pastedReplyToAClosedItemIsKeptButNotApplied() throws Exception {
        String uid = "uid-paste-closed";
        String id = create(uid, itemJson("Closed", "OTHER", FAST_PLAN));
        mvc.perform(post("/v1/items/" + id + "/cancel").header("Authorization", bearer(uid))).andExpect(status().isOk());
        pasteReply(uid, id, "refund has been processed")
                .andExpect(jsonPath("$.applied").value(false))
                .andExpect(jsonPath("$.classification").value("PAID"));
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED", "CANCELLED", "REPLY_RECEIVED");
    }

    @Test
    void pastedReplyIsOnlyForTheOwnerOfTheItem() throws Exception {
        String id = create("uid-paste-owner", itemJson("Private", "OTHER", FAST_PLAN));
        pasteReply("uid-paste-stranger", id, "refund has been processed").andExpect(status().isNotFound());
        assertThat(timelineTypes("uid-paste-owner", id)).containsExactly("CREATED");
    }

    @Test
    void pastedReplyNeedsText() throws Exception {
        String id = create("uid-paste-blank", itemJson("Blank", "OTHER", FAST_PLAN));
        pasteReply("uid-paste-blank", id, "   ").andExpect(status().isBadRequest());
        assertThat(timelineTypes("uid-paste-blank", id)).containsExactly("CREATED");
    }

    @Test
    void createdItemsGetDistinctUnguessableReplyAddresses() throws Exception {
        String a = replyAddress("uid-tok", create("uid-tok", itemJson("a", "OTHER", null)));
        String b = replyAddress("uid-tok", create("uid-tok", itemJson("b", "OTHER", null)));
        assertThat(a).isNotEqualTo(b).matches("waiting\\+[a-f0-9]{20}@reply\\.waiting-on\\.local");
    }
}
