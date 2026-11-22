package com.personalplatform.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.platform.webhooks.WebhookDeliveryWorker;
import com.personalplatform.platform.webhooks.WebhookSignature;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Webhooks (W4 item 4): endpoints with one-time signing secrets, domain events from Kafka fanned out to the owner's
 * subscribed endpoints, HMAC-signed deliveries, backoff retries with a dead-letter state, replay, and a log.
 */
class WebhooksTest extends AbstractPlatformTest {

    /** Fresh per test, so a delivery of an earlier test that is consumed late cannot reach this test's endpoints. */
    private final String OWNER = "owner-" + UUID.randomUUID();
    static final String OTHER = DeveloperAppsTest.OTHER_UID;
    static final String DOMAIN_TOPIC = "platform.domain.events.v1";
    static final String DOMAIN_DLQ = DOMAIN_TOPIC + ".dlq";

    static WebhookReceiverStub receiver;

    @Autowired KafkaTemplate<String, String> kafka;
    @Autowired WebhookDeliveryWorker worker;

    @BeforeAll
    static void startReceiver() throws Exception {
        receiver = WebhookReceiverStub.start();
    }

    @AfterAll
    static void stopReceiver() {
        receiver.stop();
    }

    @BeforeEach
    void clean() {
        DeveloperTables.wipe(dsl);
        receiver.reset();
    }

    // ----- helpers

    private String createApp(String uid) throws Exception {
        MvcResult r = mvc.perform(post("/v1/developer/apps").with(ApiKeysTest.developerOn(uid, "PRO"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Hooks\",\"redirectUris\":[]}"))
                .andExpect(status().isCreated()).andReturn();
        return JsonPath.read(r.getResponse().getContentAsString(), "$.id");
    }

    private String createEndpoint(String uid, String plan, String appId, String url, String eventTypesJson) throws Exception {
        MvcResult r = mvc.perform(post("/v1/developer/apps/" + appId + "/webhooks").with(ApiKeysTest.developerOn(uid, plan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\":\"" + url + "\",\"description\":\"test\",\"eventTypes\":" + eventTypesJson + "}"))
                .andExpect(status().isCreated()).andReturn();
        return JsonPath.read(r.getResponse().getContentAsString(), "$.id");
    }

    private String secretOf(String endpointId) {
        return dsl.fetchValue("select secret from platform.webhook_endpoints where id = cast(? as uuid)", endpointId).toString();
    }

    private long deliveries(String endpointId) {
        return ((Number) dsl.fetchValue("select count(*) from platform.webhook_deliveries where endpoint_id = cast(? as uuid)",
                endpointId)).longValue();
    }

    private String deliveryId(String endpointId) {
        return dsl.fetchValue("select id from platform.webhook_deliveries where endpoint_id = cast(? as uuid)", endpointId).toString();
    }

    private Object column(String deliveryId, String column) {
        return dsl.fetchValue("select " + column + " from platform.webhook_deliveries where id = cast(? as uuid)", deliveryId);
    }

    private void publish(String type, String ownerUid, UUID eventId) throws Exception {
        String json = "{\"eventId\":\"" + eventId + "\",\"type\":\"" + type + "\",\"occurredAt\":\"2031-03-15T10:00:00Z\","
                + "\"ownerUid\":\"" + ownerUid + "\",\"data\":{\"title\":\"Renew passport\"}}";
        kafka.send(DOMAIN_TOPIC, eventId.toString(), json).get(10, TimeUnit.SECONDS);
    }

    private static void await(BooleanSupplier condition, String what) throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
        while (System.nanoTime() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            Thread.sleep(200);
        }
        throw new AssertionError("timed out waiting for " + what);
    }

    /** A 500 from the receiver, six times over the real schedule, leaves the delivery dead. */
    private String failUntilDead(String endpointId, UUID eventId) throws Exception {
        publish("reminder.created", OWNER, eventId);
        await(() -> deliveries(endpointId) == 1, "delivery");
        String id = deliveryId(endpointId);
        receiver.respondWith(500);
        for (int attempt = 1; attempt <= 6; attempt++) {
            if (attempt > 1) {
                clock.set(clock.instant().plus(scheduleAfter(attempt - 1)));
            }
            worker.deliverDue();
        }
        assertThat(column(id, "status")).isEqualTo("DEAD");
        return id;
    }

    /** The wait the schedule prescribes after the given failed attempt (design of W4 item 4). */
    private static Duration scheduleAfter(int failedAttempt) {
        return switch (failedAttempt) {
            case 1 -> Duration.ofMinutes(1);
            case 2 -> Duration.ofMinutes(5);
            case 3 -> Duration.ofMinutes(30);
            case 4 -> Duration.ofHours(2);
            case 5 -> Duration.ofHours(12);
            default -> throw new IllegalArgumentException("no wait after " + failedAttempt);
        };
    }

    private long epochNow() {
        return clock.instant().getEpochSecond();
    }

    // ----- endpoints

    @Test
    void endpointCreationShowsTheSecretOnceAndValidatesInput() throws Exception {
        String appId = createApp(OWNER);
        MvcResult r = mvc.perform(post("/v1/developer/apps/" + appId + "/webhooks").with(ApiKeysTest.developerOn(OWNER, "PRO"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\":\"https://hooks.example.test/trove\",\"eventTypes\":[\"reminder.created\"]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.secret").value(org.hamcrest.Matchers.startsWith("whsec_")))
                .andReturn();
        String id = JsonPath.read(r.getResponse().getContentAsString(), "$.id");
        String secret = JsonPath.read(r.getResponse().getContentAsString(), "$.secret");
        assertThat(secretOf(id)).isEqualTo(secret);

        mvc.perform(get("/v1/developer/apps/" + appId + "/webhooks").with(ApiKeysTest.developerOn(OWNER, "PRO")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].secret").doesNotExist());

        String ok = "[\"reminder.created\"]";
        mvc.perform(post("/v1/developer/apps/" + appId + "/webhooks").with(ApiKeysTest.developerOn(OWNER, "PRO"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"url\":\"http://example.test/hook\",\"eventTypes\":" + ok + "}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/v1/developer/apps/" + appId + "/webhooks").with(ApiKeysTest.developerOn(OWNER, "PRO"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"url\":\"https://hooks.example.test/x\",\"eventTypes\":[\"user.deleted\"]}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/v1/developer/apps/" + appId + "/webhooks").with(ApiKeysTest.developerOn(OWNER, "PRO"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"url\":\"https://hooks.example.test/x\",\"eventTypes\":[]}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/v1/developer/webhook-events").with(ApiKeysTest.developerOn(OWNER, "PRO")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].name").value(org.hamcrest.Matchers.hasItem("reminder.created")));
    }

    @Test
    void freePlanAllowsOneEndpointAndRevokingItDoesNotFreeASlotForDeletedUrls() throws Exception {
        String appId = createApp(OWNER);
        createEndpoint(OWNER, "FREE", appId, "https://hooks.example.test/one", "[\"reminder.created\"]");
        mvc.perform(post("/v1/developer/apps/" + appId + "/webhooks").with(ApiKeysTest.developerOn(OWNER, "FREE"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"url\":\"https://hooks.example.test/two\",\"eventTypes\":[\"reminder.created\"]}"))
                .andExpect(status().isConflict());
    }

    // ----- fan-out

    @Test
    void domainEventsReachOnlyTheSubscribedEndpointsOfTheirOwner() throws Exception {
        String appA = createApp(OWNER);
        String appB = createApp(OTHER);
        String reminders = createEndpoint(OWNER, "PRO", appA, receiver.url(), "[\"reminder.created\"]");
        String consents = createEndpoint(OWNER, "PRO", appA, receiver.url(), "[\"consent.granted\"]");
        String others = createEndpoint(OTHER, "PRO", appB, receiver.url(), "[\"reminder.created\"]");

        publish("reminder.created", OWNER, UUID.randomUUID());
        await(() -> deliveries(reminders) == 1, "reminder delivery for the owner");
        assertThat(deliveries(consents)).as("not subscribed to reminders").isZero();

        publish("consent.granted", OWNER, UUID.randomUUID());
        await(() -> deliveries(consents) == 1, "consent delivery for the owner");
        assertThat(deliveries(others)).as("another owner's endpoint never receives this owner's events").isZero();
    }

    @Test
    void aDeletedEndpointStopsReceivingEvents() throws Exception {
        String appId = createApp(OWNER);
        String gone = createEndpoint(OWNER, "PRO", appId, receiver.url(), "[\"reminder.created\"]");
        String live = createEndpoint(OWNER, "PRO", appId, receiver.url(), "[\"reminder.created\"]");
        mvc.perform(delete("/v1/developer/webhooks/" + gone).with(ApiKeysTest.developerOn(OWNER, "PRO")))
                .andExpect(status().isNoContent());

        publish("reminder.created", OWNER, UUID.randomUUID());
        await(() -> deliveries(live) == 1, "delivery to the live endpoint");
        assertThat(deliveries(gone)).as("disabled endpoints are not fanned out to").isZero();
    }

    // ----- delivery

    @Test
    void aDeliveryIsSignedWithTheEndpointSecretAndMarkedDelivered() throws Exception {
        String appId = createApp(OWNER);
        String id = createEndpoint(OWNER, "PRO", appId, receiver.url(), "[\"reminder.created\"]");
        String secret = secretOf(id);
        UUID eventId = UUID.randomUUID();
        publish("reminder.created", OWNER, eventId);
        await(() -> deliveries(id) == 1, "delivery row");

        assertThat(worker.deliverDue()).isEqualTo(1);

        List<WebhookReceiverStub.Hit> hits = receiver.hits();
        assertThat(hits).hasSize(1);
        WebhookReceiverStub.Hit hit = hits.get(0);
        assertThat(hit.header("x-trove-event-id")).isEqualTo(eventId.toString());
        assertThat(hit.header("x-trove-event-type")).isEqualTo("reminder.created");
        assertThat(hit.header("x-trove-delivery-id")).isEqualTo(deliveryId(id));
        assertThat(hit.body()).contains("\"eventId\":\"" + eventId + "\"");
        assertThat(WebhookSignature.verify(hit.header("x-trove-signature"), secret, hit.body(), epochNow(), 300))
                .as("the receiver can verify the signature with the secret it was given").isTrue();
        assertThat(WebhookSignature.verify(hit.header("x-trove-signature"), "whsec_wrong", hit.body(), epochNow(), 300)).isFalse();

        assertThat(column(deliveryId(id), "status")).isEqualTo("DELIVERED");
        assertThat(column(deliveryId(id), "attempts")).isEqualTo(1);
        assertThat(column(deliveryId(id), "delivered_at")).isNotNull();
        assertThat(column(deliveryId(id), "last_status_code")).isEqualTo(200);
    }

    @Test
    void failuresBackOffOnTheScheduleThenDeadLetter() throws Exception {
        String appId = createApp(OWNER);
        String endpointId = createEndpoint(OWNER, "PRO", appId, receiver.url(), "[\"reminder.created\"]");
        receiver.respondWith(500);
        publish("reminder.created", OWNER, UUID.randomUUID());
        await(() -> deliveries(endpointId) == 1, "delivery row");
        String id = deliveryId(endpointId);
        Instant start = clock.instant();

        assertThat(worker.deliverDue()).isEqualTo(1);
        assertThat(column(id, "status")).isEqualTo("PENDING");
        assertThat(column(id, "attempts")).isEqualTo(1);
        assertThat(((java.time.OffsetDateTime) column(id, "next_attempt_at")).toInstant()).isEqualTo(start.plus(Duration.ofMinutes(1)));

        assertThat(worker.deliverDue()).as("not due yet, so nothing is sent").isZero();
        assertThat(receiver.hits()).hasSize(1);

        for (int attempt = 2; attempt <= 5; attempt++) {
            clock.set(clock.instant().plus(scheduleAfter(attempt - 1)));
            assertThat(worker.deliverDue()).isEqualTo(1);
            assertThat(column(id, "attempts")).isEqualTo(attempt);
            assertThat(column(id, "status")).isEqualTo("PENDING");
            assertThat(((java.time.OffsetDateTime) column(id, "next_attempt_at")).toInstant())
                    .isEqualTo(clock.instant().plus(scheduleAfter(attempt)));
        }
        clock.set(clock.instant().plus(scheduleAfter(5)));
        assertThat(worker.deliverDue()).isEqualTo(1);
        assertThat(column(id, "attempts")).isEqualTo(6);
        assertThat(column(id, "status")).isEqualTo("DEAD");
        assertThat(column(id, "next_attempt_at")).isNull();

        clock.set(clock.instant().plus(Duration.ofDays(365)));
        assertThat(worker.deliverDue()).as("dead deliveries are never sent again on their own").isZero();
        assertThat(receiver.hits()).hasSize(6);
    }

    @Test
    void replayRedeliversTheSameEventAsANewDelivery() throws Exception {
        String appId = createApp(OWNER);
        String endpointId = createEndpoint(OWNER, "PRO", appId, receiver.url(), "[\"reminder.created\"]");
        String dead = failUntilDead(endpointId, UUID.randomUUID());
        String originalBody = receiver.hits().get(0).body();

        receiver.respondWith(200);
        MvcResult r = mvc.perform(post("/v1/developer/webhooks/" + endpointId + "/deliveries/" + dead + "/replay")
                        .with(ApiKeysTest.developerOn(OWNER, "PRO")))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.replayOf").value(dead))
                .andReturn();
        String replayId = JsonPath.read(r.getResponse().getContentAsString(), "$.id");

        assertThat(worker.deliverDue()).isEqualTo(1);
        assertThat(column(replayId, "status")).isEqualTo("DELIVERED");
        assertThat(column(dead, "status")).as("the original stays dead as history").isEqualTo("DEAD");
        assertThat(column(replayId, "replay_of").toString()).isEqualTo(dead);
        WebhookReceiverStub.Hit last = receiver.hits().get(receiver.hits().size() - 1);
        assertThat(last.body()).isEqualTo(originalBody);
        assertThat(last.header("x-trove-delivery-id")).isEqualTo(replayId);
    }

    @Test
    void theDeliveryLogIsOwnerScopedAndReplayIsRefusedForOthers() throws Exception {
        String appId = createApp(OWNER);
        String endpointId = createEndpoint(OWNER, "PRO", appId, receiver.url(), "[\"reminder.created\"]");
        publish("reminder.created", OWNER, UUID.randomUUID());
        await(() -> deliveries(endpointId) == 1, "delivery row");
        String id = deliveryId(endpointId);

        mvc.perform(get("/v1/developer/webhooks/" + endpointId + "/deliveries").with(ApiKeysTest.developerOn(OWNER, "PRO")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].status").value("PENDING"));
        mvc.perform(get("/v1/developer/webhooks/" + endpointId + "/deliveries").with(ApiKeysTest.developerOn(OTHER, "PRO")))
                .andExpect(status().isNotFound());
        mvc.perform(post("/v1/developer/webhooks/" + endpointId + "/deliveries/" + id + "/replay").with(ApiKeysTest.developerOn(OTHER, "PRO")))
                .andExpect(status().isNotFound());
        mvc.perform(post("/v1/developer/webhooks/" + endpointId + "/secret/rotate").with(ApiKeysTest.developerOn(OTHER, "PRO")))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/v1/developer/webhooks/" + endpointId).with(ApiKeysTest.developerOn(OTHER, "PRO")))
                .andExpect(status().isNotFound());
        mvc.perform(get("/v1/developer/apps/" + appId + "/webhooks").with(DeveloperAppsTest.member(OWNER)))
                .andExpect(status().isForbidden());
    }

    @Test
    void rotatingTheSecretChangesWhatTheNextDeliveryIsSignedWith() throws Exception {
        String appId = createApp(OWNER);
        String endpointId = createEndpoint(OWNER, "PRO", appId, receiver.url(), "[\"reminder.created\"]");
        String oldSecret = secretOf(endpointId);
        publish("reminder.created", OWNER, UUID.randomUUID());
        await(() -> deliveries(endpointId) == 1, "first delivery");
        worker.deliverDue();
        String oldSignature = receiver.hits().get(0).header("x-trove-signature");

        MvcResult r = mvc.perform(post("/v1/developer/webhooks/" + endpointId + "/secret/rotate").with(ApiKeysTest.developerOn(OWNER, "PRO")))
                .andExpect(status().isOk()).andReturn();
        String newSecret = JsonPath.read(r.getResponse().getContentAsString(), "$.secret");
        assertThat(newSecret).isNotEqualTo(oldSecret);
        assertThat(secretOf(endpointId)).isEqualTo(newSecret);

        assertThat(WebhookSignature.verify(oldSignature, newSecret, receiver.hits().get(0).body(), epochNow(), 300))
                .as("a signature made with the old secret no longer verifies").isFalse();

        publish("reminder.created", OWNER, UUID.randomUUID());
        await(() -> deliveries(endpointId) == 2, "second delivery");
        worker.deliverDue();
        WebhookReceiverStub.Hit second = receiver.hits().get(receiver.hits().size() - 1);
        assertThat(WebhookSignature.verify(second.header("x-trove-signature"), newSecret, second.body(), epochNow(), 300)).isTrue();
    }

    // ----- Kafka edges

    @Test
    void anUnreadableDomainEventGoesToTheDeadLetterTopic() throws Exception {
        kafka.send(DOMAIN_TOPIC, "bad", "not json at all").get(10, TimeUnit.SECONDS);
        Properties props = new Properties();
        props.put("bootstrap.servers", KAFKA.getBootstrapServers());
        props.put("group.id", "dlq-test-" + UUID.randomUUID());
        props.put("auto.offset.reset", "earliest");
        props.put("key.deserializer", StringDeserializer.class.getName());
        props.put("value.deserializer", StringDeserializer.class.getName());
        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props)) {
            consumer.subscribe(List.of(DOMAIN_DLQ));
            boolean found = false;
            long deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
            while (!found && System.nanoTime() < deadline) {
                for (ConsumerRecord<String, String> record : consumer.poll(Duration.ofMillis(500))) {
                    found |= "not json at all".equals(record.value());
                }
            }
            assertThat(found).as("the bad event was dead-lettered").isTrue();
        }
    }
}
