package com.personalplatform.homepulse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.personalplatform.homepulse.device.DeviceTokens;
import java.time.Instant;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

class IngestionApiTest extends AbstractIntegrationTest {

    private static final Instant T0 = TestSupportConfig.T0;

    private static String reading(Instant ts, double watts) {
        return "{\"ts\":\"" + ts + "\",\"watts\":" + watts + "}";
    }

    private static String batch(String... readings) {
        return "{\"readings\":[" + String.join(",", readings) + "]}";
    }

    private ResultActions ingest(String authorization, String body) throws Exception {
        var req = post("/v1/ingest/readings").contentType(MediaType.APPLICATION_JSON).content(body);
        if (authorization != null) {
            req = req.header("Authorization", authorization);
        }
        return mvc.perform(req);
    }

    private long rowCount(UUID deviceId) {
        return ((Number) dsl.fetchValue("select count(*) from home_pulse.readings where device_id = ?", deviceId)).longValue();
    }

    // ------------------------------------------------------------ authentication

    @Test
    void rejectsMissingMalformedUnknownAndWrongSchemeTokens() throws Exception {
        String body = batch(reading(T0.minusSeconds(10), 100));
        ingest(null, body).andExpect(status().isUnauthorized());
        ingest("Bearer ", body).andExpect(status().isUnauthorized());
        ingest("Bearer garbage", body).andExpect(status().isUnauthorized());
        ingest("Bearer hpd_" + "x".repeat(43), body).andExpect(status().isUnauthorized());   // well formed, never issued
        ingest("Basic aGVsbG86d29ybGQ=", body).andExpect(status().isUnauthorized());
        ingest("Bearer " + DeviceTokens.generate(), body).andExpect(status().isUnauthorized());
    }

    @Test
    void unauthorizedResponseIsAProblemDetailWithoutHints() throws Exception {
        ingest("Bearer hpd_" + "y".repeat(43), batch(reading(T0, 1)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.detail").value("Missing or invalid device token"));
    }

    @Test
    void firebaseUserTokenIsNotAcceptedOnTheIngestEndpoint() throws Exception {
        UUID appliance = createAppliance(ALICE, "FRIDGE", "");
        registerDevice(ALICE, appliance);
        ingest(bearer(ALICE), batch(reading(T0.minusSeconds(5), 100))).andExpect(status().isUnauthorized());
    }

    @Test
    void deviceTokenCannotCallOwnerApis() throws Exception {
        UUID appliance = createAppliance(ALICE, "FRIDGE", "");
        var device = registerDevice(ALICE, appliance);
        mvc.perform(get("/v1/appliances").header("Authorization", "Bearer " + device.token()))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/appliances/" + appliance).header("Authorization", "Bearer " + device.token()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void revokedTokenStopsWorkingImmediately() throws Exception {
        UUID appliance = createAppliance(ALICE, "FRIDGE", "");
        var device = registerDevice(ALICE, appliance);
        String auth = "Bearer " + device.token();
        ingest(auth, batch(reading(T0.minusSeconds(60), 100))).andExpect(status().isOk());

        mvc.perform(delete("/v1/devices/" + device.deviceId()).header("Authorization", bearer(ALICE)))
                .andExpect(status().isNoContent());
        ingest(auth, batch(reading(T0.minusSeconds(30), 100))).andExpect(status().isUnauthorized());
        assertThat(rowCount(device.deviceId())).isEqualTo(1);
    }

    @Test
    void onlyTheHashOfTheTokenIsStored() throws Exception {
        UUID appliance = createAppliance(ALICE, "FRIDGE", "");
        var device = registerDevice(ALICE, appliance);
        String stored = dsl.fetchValue("select token_hash from home_pulse.devices where id = ?", device.deviceId()).toString().trim();
        assertThat(stored).isEqualTo(DeviceTokens.hash(device.token())).doesNotContain(device.token());
        String prefix = dsl.fetchValue("select token_prefix from home_pulse.devices where id = ?", device.deviceId()).toString();
        assertThat(device.token()).startsWith(prefix).hasSizeGreaterThan(prefix.length() + 20);
        // listing never reveals the token again
        String list = getAs(ALICE, "/v1/appliances/" + appliance + "/devices").andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(list).doesNotContain(device.token()).doesNotContain("ingestionToken");
    }

    // ------------------------------------------------------------ idempotency

    @Test
    void duplicateReadingsAreIgnoredSoRetriesNeverDoubleCount() throws Exception {
        UUID appliance = createAppliance(ALICE, "FRIDGE", "");
        var device = registerDevice(ALICE, appliance);
        String auth = "Bearer " + device.token();
        String body = batch(reading(T0.minusSeconds(300), 110), reading(T0.minusSeconds(240), 112), reading(T0.minusSeconds(180), 3));

        ingest(auth, body).andExpect(status().isOk())
                .andExpect(jsonPath("$.received").value(3)).andExpect(jsonPath("$.accepted").value(3))
                .andExpect(jsonPath("$.duplicates").value(0)).andExpect(jsonPath("$.rejected").value(0));
        // device lost the response and retries the very same batch
        ingest(auth, body).andExpect(status().isOk())
                .andExpect(jsonPath("$.accepted").value(0)).andExpect(jsonPath("$.duplicates").value(3));
        assertThat(rowCount(device.deviceId())).isEqualTo(3);

        // overlapping batch: 1 new + 2 known
        ingest(auth, batch(reading(T0.minusSeconds(240), 999), reading(T0.minusSeconds(180), 999), reading(T0.minusSeconds(120), 5)))
                .andExpect(jsonPath("$.accepted").value(1)).andExpect(jsonPath("$.duplicates").value(2));
        assertThat(rowCount(device.deviceId())).isEqualTo(4);
        // the first write wins: the retry with a different value did not overwrite
        assertThat(((Number) dsl.fetchValue("select watts from home_pulse.readings where device_id = ? and ts = cast(? as timestamptz)",
                device.deviceId(), T0.minusSeconds(240).toString())).doubleValue()).isEqualTo(112.0);
    }

    @Test
    void sameTimestampTwiceInOneBatchIsStoredOnce() throws Exception {
        UUID appliance = createAppliance(ALICE, "FRIDGE", "");
        var device = registerDevice(ALICE, appliance);
        Instant ts = T0.minusSeconds(100);
        ingest("Bearer " + device.token(), batch(reading(ts, 50), reading(ts, 60)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.accepted").value(1)).andExpect(jsonPath("$.duplicates").value(1));
        assertThat(rowCount(device.deviceId())).isEqualTo(1);
    }

    @Test
    void readingsGoToTheAuthenticatedDeviceOnlyAndTouchLastSeen() throws Exception {
        var a = registerDevice(ALICE, createAppliance(ALICE, "FRIDGE", ""));
        var b = registerDevice(BOB, createAppliance(BOB, "FRIDGE", ""));
        ingest("Bearer " + a.token(), batch(reading(T0.minusSeconds(60), 100))).andExpect(status().isOk());
        assertThat(rowCount(a.deviceId())).isEqualTo(1);
        assertThat(rowCount(b.deviceId())).isZero();
        assertThat(dsl.fetchValue("select last_seen_at from home_pulse.devices where id = ?", a.deviceId())).isNotNull();
        assertThat(dsl.fetchValue("select last_seen_at from home_pulse.devices where id = ?", b.deviceId())).isNull();
    }

    // ------------------------------------------------------------ validation and limits

    @Test
    void rejectsInvalidBodies() throws Exception {
        var device = registerDevice(ALICE, createAppliance(ALICE, "FRIDGE", ""));
        String auth = "Bearer " + device.token();
        ingest(auth, "{\"readings\":[]}").andExpect(status().isBadRequest());
        ingest(auth, "{}").andExpect(status().isBadRequest());
        ingest(auth, "not json").andExpect(status().isBadRequest());
        ingest(auth, batch("{\"watts\":10}")).andExpect(status().isBadRequest());                         // no ts
        ingest(auth, batch("{\"ts\":\"" + T0.minusSeconds(5) + "\"}")).andExpect(status().isBadRequest()); // no watts
        ingest(auth, batch(reading(T0.minusSeconds(5), -1))).andExpect(status().isBadRequest());         // negative
        ingest(auth, batch(reading(T0.minusSeconds(5), 5_000_000))).andExpect(status().isBadRequest());  // absurd
        ingest(auth, batch("{\"ts\":\"yesterday\",\"watts\":1}")).andExpect(status().isBadRequest());
        assertThat(rowCount(device.deviceId())).isZero();
    }

    @Test
    void rejectsOversizedBatch() throws Exception {
        var device = registerDevice(ALICE, createAppliance(ALICE, "FRIDGE", ""));
        String many = IntStream.range(0, 1001).mapToObj(i -> reading(T0.minusSeconds(2000 - i), 10))
                .collect(Collectors.joining(","));
        ingest("Bearer " + device.token(), batch(many)).andExpect(status().isBadRequest());
        assertThat(rowCount(device.deviceId())).isZero();
    }

    @Test
    void readingsOutsideTheAcceptedTimeWindowAreCountedAsRejected() throws Exception {
        var device = registerDevice(ALICE, createAppliance(ALICE, "FRIDGE", ""));
        ingest("Bearer " + device.token(), batch(
                        reading(T0.plusSeconds(3600), 10),          // clock-skewed sensor: an hour ahead
                        reading(T0.minusSeconds(40L * 86400), 10),  // older than max-age
                        reading(T0.minusSeconds(10), 10)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accepted").value(1)).andExpect(jsonPath("$.rejected").value(2));
        assertThat(rowCount(device.deviceId())).isEqualTo(1);
    }

    @Test
    void optionalVoltsAndAmpsArePersisted() throws Exception {
        var device = registerDevice(ALICE, createAppliance(ALICE, "FRIDGE", ""));
        ingest("Bearer " + device.token(), batch(
                "{\"ts\":\"" + T0.minusSeconds(10) + "\",\"watts\":118.5,\"volts\":229.1,\"amps\":0.52}"))
                .andExpect(status().isOk());
        var row = dsl.fetchOne("select volts, amps from home_pulse.readings where device_id = ?", device.deviceId());
        assertThat(((Number) row.get(0)).doubleValue()).isEqualTo(229.1);
        assertThat(((Number) row.get(1)).doubleValue()).isEqualTo(0.52);
    }
}
