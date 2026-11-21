package com.personalplatform.homepulse.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.homepulse.ingest.MqttReadingMapper.Mapped;
import com.personalplatform.homepulse.ingest.MqttReadingMapper.Rejected;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class MqttReadingMapperTest {

    static final UUID DEVICE = UUID.fromString("0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b");
    static final String TOPIC = "homepulse/" + DEVICE + "/reading";
    static final Instant RECEIVED = Instant.parse("2031-01-15T12:00:00Z");

    private static MqttReadingMapper.Result map(String topic, String payload) {
        return MqttReadingMapper.map(topic, payload == null ? null : payload.getBytes(StandardCharsets.UTF_8), RECEIVED);
    }

    private static Mapped ok(String payload) {
        var r = map(TOPIC, payload);
        assertThat(r).isInstanceOf(Mapped.class);
        return (Mapped) r;
    }

    private static String rejectedReason(String topic, String payload) {
        var r = map(topic, payload);
        assertThat(r).as("payload %s", payload).isInstanceOf(Rejected.class);
        return ((Rejected) r).reason();
    }

    @Test
    void mapsAFullMessage() {
        Mapped m = ok("{\"watts\":118.4,\"volts\":229.8,\"amps\":0.52,\"ts\":\"2031-01-15T11:59:30Z\"}");
        assertThat(m.deviceId()).isEqualTo(DEVICE);
        assertThat(m.reading()).isEqualTo(new ReadingInput(Instant.parse("2031-01-15T11:59:30Z"), 118.4, 229.8, 0.52));
    }

    @Test
    void wattsOnlyUsesReceiveTime() {
        assertThat(ok("{\"watts\":0}").reading()).isEqualTo(new ReadingInput(RECEIVED, 0.0, null, null));
        assertThat(ok("{\"watts\":5,\"ts\":null,\"volts\":null}").reading().ts()).isEqualTo(RECEIVED);
    }

    @Test
    void numericTimestampsAreSecondsOrMilliseconds() {
        Instant expected = Instant.parse("2031-01-15T11:00:00Z");
        assertThat(ok("{\"watts\":1,\"ts\":" + expected.getEpochSecond() + "}").reading().ts()).isEqualTo(expected);
        assertThat(ok("{\"watts\":1,\"ts\":" + expected.toEpochMilli() + "}").reading().ts()).isEqualTo(expected);
        assertThat(ok("{\"watts\":1,\"ts\":" + expected.getEpochSecond() + ".5}").reading().ts())
                .isEqualTo(expected.plusMillis(500));
    }

    @Test
    void uppercaseDeviceIdIsAccepted() {
        var r = MqttReadingMapper.map("homepulse/" + DEVICE.toString().toUpperCase() + "/reading", "{\"watts\":1}".getBytes(), RECEIVED);
        assertThat(r).isInstanceOf(Mapped.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "", "   ", "not json", "{", "[1,2,3]", "42", "\"watts\"", "null", "{}",
            "{\"watts\":\"100\"}", "{\"watts\":null}", "{\"watts\":true}", "{\"watts\":[1]}", "{\"watts\":{\"v\":1}}",
            "{\"watts\":-0.5}", "{\"watts\":1e9}", "{\"watts\":1e400}",
            "{\"watts\":1,\"volts\":\"230\"}", "{\"watts\":1,\"volts\":-1}", "{\"watts\":1,\"volts\":5000}",
            "{\"watts\":1,\"amps\":\"x\"}", "{\"watts\":1,\"amps\":-3}",
            "{\"watts\":1,\"ts\":\"yesterday\"}", "{\"watts\":1,\"ts\":true}", "{\"watts\":1,\"ts\":-5}", "{\"watts\":1,\"ts\":0}",
            "{\"watts\":1,\"ts\":{}}",
            "���"
    })
    void malformedPayloadsAreRejectedNeverThrown(String payload) {
        assertThat(rejectedReason(TOPIC, payload)).isNotBlank();
    }

    @Test
    void emptyNullAndOversizedPayloads() {
        assertThat(MqttReadingMapper.map(TOPIC, null, RECEIVED)).isInstanceOf(Rejected.class);
        assertThat(MqttReadingMapper.map(TOPIC, new byte[0], RECEIVED)).isInstanceOf(Rejected.class);
        byte[] big = ("{\"watts\":1,\"pad\":\"" + "x".repeat(3000) + "\"}").getBytes(StandardCharsets.UTF_8);
        assertThat(MqttReadingMapper.map(TOPIC, big, RECEIVED)).isInstanceOf(Rejected.class);
        assertThat(MqttReadingMapper.map(TOPIC, new byte[] {(byte) 0xff, (byte) 0xfe, 0x00}, RECEIVED)).isInstanceOf(Rejected.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "", "homepulse", "homepulse/reading", "homepulse//reading", "homepulse/not-a-uuid/reading",
            "homepulse/0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b/status", "other/0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b/reading",
            "homepulse/0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b/reading/extra", "homepulse/+/reading", "homepulse/#",
            "homepulse/zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz/reading", "/homepulse/0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b/reading"
    })
    void badTopicsAreRejected(String topic) {
        assertThat(map(topic, "{\"watts\":1}")).isInstanceOf(Rejected.class);
    }

    @Test
    void nullTopicIsRejected() {
        assertThat(MqttReadingMapper.map(null, "{\"watts\":1}".getBytes(), RECEIVED)).isInstanceOf(Rejected.class);
    }

    @Test
    void unknownExtraFieldsAreIgnored() {
        assertThat(ok("{\"watts\":7,\"rssi\":-60,\"fw\":\"1.2\"}").reading().watts()).isEqualTo(7.0);
    }
}
