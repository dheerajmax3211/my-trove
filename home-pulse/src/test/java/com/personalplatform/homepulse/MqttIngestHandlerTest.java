package com.personalplatform.homepulse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;

import com.personalplatform.homepulse.ingest.MqttIngestHandler;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** MQTT message -> mapper -> device check -> idempotent store, without a broker (the Paho client is a thin shell). */
class MqttIngestHandlerTest extends AbstractIntegrationTest {

    @Autowired MqttIngestHandler handler;

    private long rows(UUID device) {
        return ((Number) dsl.fetchValue("select count(*) from home_pulse.readings where device_id = ?", device)).longValue();
    }

    private static byte[] json(String s) {
        return s.getBytes(StandardCharsets.UTF_8);
    }

    @Test
    void storesValidMessagesIdempotentlyAndDropsEverythingElse() throws Exception {
        var device = registerDevice(ALICE, createAppliance(ALICE, "FRIDGE", ""));
        String topic = "homepulse/" + device.deviceId() + "/reading";
        Instant ts = TestSupportConfig.T0.minusSeconds(30);
        byte[] msg = json("{\"watts\":117.2,\"volts\":230,\"ts\":\"" + ts + "\"}");
        long storedBefore = handler.storedCount();
        long droppedBefore = handler.droppedCount();

        handler.handle(topic, msg);
        handler.handle(topic, msg);                                           // broker redelivery (QoS 1) -> no double count
        handler.handle(topic, json("{\"watts\":\"oops\"}"));                  // malformed
        handler.handle(topic, json("garbage"));
        handler.handle("homepulse/" + UUID.randomUUID() + "/reading", msg);   // unknown device
        handler.handle("homepulse/bad/reading", msg);                         // bad topic
        handler.handle(topic, json("{\"watts\":5,\"ts\":\"" + TestSupportConfig.T0.plusSeconds(7200) + "\"}"));   // from the future

        assertThat(rows(device.deviceId())).isEqualTo(1);
        assertThat(handler.storedCount() - storedBefore).isEqualTo(1);
        assertThat(handler.droppedCount() - droppedBefore).isEqualTo(5);      // 2 malformed + unknown + bad topic + future
    }

    @Test
    void messageWithoutTimestampUsesReceiveTimeAndRevokedDevicesAreIgnored() throws Exception {
        var device = registerDevice(ALICE, createAppliance(ALICE, "FRIDGE", ""));
        String topic = "homepulse/" + device.deviceId() + "/reading";
        handler.handle(topic, json("{\"watts\":42}"));
        assertThat(dsl.fetchValue("select ts = cast(? as timestamptz) from home_pulse.readings where device_id = ?",
                TestSupportConfig.T0.toString(), device.deviceId())).isEqualTo(true);

        mvc.perform(delete("/v1/devices/" + device.deviceId()).header("Authorization", bearer(ALICE)));
        clock.advance(java.time.Duration.ofMinutes(1));
        handler.handle(topic, json("{\"watts\":43}"));
        assertThat(rows(device.deviceId())).isEqualTo(1);
    }

    @Test
    void handlerNeverThrowsOnNullInput() {
        handler.handle(null, null);
        handler.handle("homepulse/x", new byte[0]);
    }
}
