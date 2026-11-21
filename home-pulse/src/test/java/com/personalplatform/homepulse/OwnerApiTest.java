package com.personalplatform.homepulse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.homepulse.alert.AlertRepository;
import com.personalplatform.homepulse.detect.AlertKind;
import com.personalplatform.homepulse.detect.Finding;
import com.personalplatform.homepulse.detect.MinuteSample;
import com.personalplatform.homepulse.detect.Severity;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

class OwnerApiTest extends AbstractIntegrationTest {

    private static final Instant T0 = TestSupportConfig.T0;

    @Autowired AlertRepository alertRepo;

    private static List<MinuteSample> constant(Instant from, int minutes, double watts) {
        List<MinuteSample> out = new ArrayList<>();
        for (int i = 0; i < minutes; i++) {
            out.add(new MinuteSample(from.plusSeconds(60L * i), watts));
        }
        return out;
    }

    private UUID alert(String owner, UUID appliance, AlertKind kind, Severity sev) {
        return alertRepo.insert(owner, appliance, new Finding(kind, sev, "msg " + kind, Map.of("k", 1)), T0);
    }

    // ------------------------------------------------------------ appliances CRUD

    @Test
    void applianceCrudRoundTrip() throws Exception {
        String body = """
                {"name":"Living room AC","type":"AIR_CONDITIONER","location":"Living room",
                 "purchaseDate":"2029-05-01","warrantyEndDate":"2031-05-01",
                 "lastServiceDate":"2030-04-01","nextServiceDate":"2031-04-01","notes":"split unit"}""";
        String created = mvc.perform(post("/v1/appliances").header("Authorization", bearer(ALICE))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.type").value("AIR_CONDITIONER"))
                .andExpect(jsonPath("$.underWarranty").value(true))
                .andExpect(jsonPath("$.daysToWarrantyEnd").value(106))
                .andExpect(jsonPath("$.serviceOverdue").value(false))
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(created, "$.id");

        getAs(ALICE, "/v1/appliances").andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)));
        getAs(ALICE, "/v1/appliances/" + id).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Living room AC"));

        mvc.perform(put("/v1/appliances/" + id).header("Authorization", bearer(ALICE)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Bedroom AC\",\"type\":\"AIR_CONDITIONER\",\"warrantyEndDate\":\"2031-01-01\","
                                + "\"nextServiceDate\":\"2031-01-10\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Bedroom AC"))
                .andExpect(jsonPath("$.underWarranty").value(false))
                .andExpect(jsonPath("$.serviceOverdue").value(true))
                .andExpect(jsonPath("$.location").doesNotExist());

        mvc.perform(delete("/v1/appliances/" + id).header("Authorization", bearer(ALICE))).andExpect(status().isNoContent());
        getAs(ALICE, "/v1/appliances/" + id).andExpect(status().isNotFound());
    }

    @Test
    void applianceValidation() throws Exception {
        for (String bad : List.of(
                "{\"type\":\"FRIDGE\"}",
                "{\"name\":\"  \",\"type\":\"FRIDGE\"}",
                "{\"name\":\"x\"}",
                "{\"name\":\"x\",\"type\":\"TOASTER\"}",
                "{\"name\":\"x\",\"type\":\"FRIDGE\",\"purchaseDate\":\"2030-01-01\",\"warrantyEndDate\":\"2029-01-01\"}",
                "{\"name\":\"x\",\"type\":\"FRIDGE\",\"lastServiceDate\":\"2030-06-01\",\"nextServiceDate\":\"2030-01-01\"}")) {
            mvc.perform(post("/v1/appliances").header("Authorization", bearer(ALICE))
                            .contentType(MediaType.APPLICATION_JSON).content(bad))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.status").value(400));
        }
        mvc.perform(post("/v1/appliances").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
    }

    // ------------------------------------------------------------ devices

    @Test
    void oneActiveDevicePerApplianceAndRotationByRevoking() throws Exception {
        UUID appliance = createAppliance(ALICE, "FRIDGE", "");
        var first = registerDevice(ALICE, appliance);
        assertThat(first.token()).startsWith("hpd_");
        mvc.perform(post("/v1/appliances/" + appliance + "/devices").header("Authorization", bearer(ALICE))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"label\":\"second\"}"))
                .andExpect(status().isConflict());
        mvc.perform(delete("/v1/devices/" + first.deviceId()).header("Authorization", bearer(ALICE)))
                .andExpect(status().isNoContent());
        var second = registerDevice(ALICE, appliance);
        assertThat(second.token()).isNotEqualTo(first.token());
        getAs(ALICE, "/v1/appliances/" + appliance + "/devices").andExpect(jsonPath("$", hasSize(2)));
        mvc.perform(post("/v1/appliances/" + appliance + "/devices").header("Authorization", bearer(ALICE))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"label\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    // ------------------------------------------------------------ readings (downsampled via continuous aggregates)

    @Test
    void readingsBucketIsChosenFromTheRange() throws Exception {
        UUID appliance = createAppliance(ALICE, "FRIDGE", "");
        var device = registerDevice(ALICE, appliance);
        seed(device.deviceId(), constant(T0.minus(Duration.ofDays(3)), 3 * 1440, 100));
        String from = "from=";

        // 30 minutes -> raw
        getAs(ALICE, "/v1/appliances/" + appliance + "/readings?from=" + T0.minus(Duration.ofMinutes(30)) + "&to=" + T0)
                .andExpect(status().isOk()).andExpect(jsonPath("$.resolution").value("RAW"))
                .andExpect(jsonPath("$.points", hasSize(30))).andExpect(jsonPath("$.points[0].avgWatts").value(100.0))
                .andExpect(jsonPath("$.points[0].samples").value(1));
        // 6 hours -> 1-minute aggregate
        getAs(ALICE, "/v1/appliances/" + appliance + "/readings?from=" + T0.minus(Duration.ofHours(6)) + "&to=" + T0)
                .andExpect(jsonPath("$.resolution").value("ONE_MINUTE")).andExpect(jsonPath("$.points", hasSize(360)));
        // 10 days -> hourly aggregate; only 3 days have data: 72 buckets of 60 samples
        getAs(ALICE, "/v1/appliances/" + appliance + "/readings?from=" + T0.minus(Duration.ofDays(10)) + "&to=" + T0)
                .andExpect(jsonPath("$.resolution").value("ONE_HOUR")).andExpect(jsonPath("$.points", hasSize(72)))
                .andExpect(jsonPath("$.points[0].samples").value(60)).andExpect(jsonPath("$.points[10].avgWatts").value(100.0));
        // 100 days -> daily buckets: 3 or 4 days touched depending on alignment, always 24 h * 60 samples in the full ones
        String daily = getAs(ALICE, "/v1/appliances/" + appliance + "/readings?from=" + T0.minus(Duration.ofDays(100)) + "&to=" + T0)
                .andExpect(jsonPath("$.resolution").value("ONE_DAY")).andReturn().getResponse().getContentAsString();
        List<Integer> samples = JsonPath.read(daily, "$.points[*].samples");
        assertThat(samples.stream().mapToInt(Integer::intValue).sum()).isEqualTo(3 * 1440);
        // default window is the last 24 hours at 1-minute resolution
        getAs(ALICE, "/v1/appliances/" + appliance + "/readings").andExpect(jsonPath("$.resolution").value("ONE_MINUTE"))
                .andExpect(jsonPath("$.points", hasSize(1440)));
    }

    @Test
    void readingsQueryGuards() throws Exception {
        UUID appliance = createAppliance(ALICE, "FRIDGE", "");
        String base = "/v1/appliances/" + appliance + "/readings?";
        getAs(ALICE, base + "from=" + T0 + "&to=" + T0.minusSeconds(60)).andExpect(status().isBadRequest());
        getAs(ALICE, base + "from=" + T0.minus(Duration.ofDays(10)) + "&to=" + T0 + "&resolution=ONE_MINUTE")
                .andExpect(status().isBadRequest());                         // 14400 points requested
        getAs(ALICE, base + "from=" + T0.minus(Duration.ofDays(500)) + "&to=" + T0).andExpect(status().isBadRequest());
        getAs(ALICE, base + "resolution=BOGUS").andExpect(status().isBadRequest());
        getAs(ALICE, base + "from=not-a-date").andExpect(status().isBadRequest());
        getAs(ALICE, base).andExpect(status().isOk()).andExpect(jsonPath("$.points", hasSize(0)));   // no device yet
    }

    // ------------------------------------------------------------ alerts

    @Test
    void alertsAreListedWithWarrantyContextAndCanBeAcknowledged() throws Exception {
        UUID appliance = createAppliance(ALICE, "FRIDGE", ",\"warrantyEndDate\":\"2031-02-14\",\"nextServiceDate\":\"2031-01-01\"");
        UUID alertId = alert(ALICE, appliance, AlertKind.POWER_SHIFT, Severity.WARNING);

        getAs(ALICE, "/v1/alerts").andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(alertId.toString()))
                .andExpect(jsonPath("$[0].kind").value("POWER_SHIFT"))
                .andExpect(jsonPath("$[0].status").value("OPEN"))
                .andExpect(jsonPath("$[0].evidence.k").value(1))
                .andExpect(jsonPath("$[0].underWarranty").value(true))
                .andExpect(jsonPath("$[0].daysToWarrantyEnd").value(30))
                .andExpect(jsonPath("$[0].serviceOverdue").value(true));

        mvc.perform(post("/v1/alerts/" + alertId + "/ack").header("Authorization", bearer(ALICE)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACKNOWLEDGED"))
                .andExpect(jsonPath("$.acknowledgedAt").exists());
        mvc.perform(post("/v1/alerts/" + alertId + "/ack").header("Authorization", bearer(ALICE)))   // idempotent
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACKNOWLEDGED"));
        getAs(ALICE, "/v1/alerts?status=ACKNOWLEDGED").andExpect(jsonPath("$", hasSize(1)));
        getAs(ALICE, "/v1/alerts?status=OPEN").andExpect(jsonPath("$", hasSize(0)));

        // resolved alerts are history: hidden by default, cannot be acknowledged
        alertRepo.resolve(alertId, T0);
        getAs(ALICE, "/v1/alerts").andExpect(jsonPath("$", hasSize(0)));
        getAs(ALICE, "/v1/alerts?includeResolved=true").andExpect(jsonPath("$", hasSize(1)));
        mvc.perform(post("/v1/alerts/" + alertId + "/ack").header("Authorization", bearer(ALICE))).andExpect(status().isConflict());
    }

    @Test
    void onlyOneLiveAlertPerKindIsPossibleAtTheDatabaseLevel() throws Exception {
        UUID appliance = createAppliance(ALICE, "FRIDGE", "");
        alert(ALICE, appliance, AlertKind.STUCK_ON, Severity.WARNING);
        alert(ALICE, appliance, AlertKind.STUCK_ON, Severity.CRITICAL);   // concurrent duplicate: ON CONFLICT DO NOTHING
        alert(ALICE, appliance, AlertKind.NO_DATA, Severity.WARNING);
        getAs(ALICE, "/v1/alerts").andExpect(jsonPath("$", hasSize(2)));
    }

    // ------------------------------------------------------------ health

    @Test
    void healthSummaryReflectsDeviceBaselineAlertsAndEnergy() throws Exception {
        UUID appliance = createAppliance(ALICE, "FRIDGE", ",\"warrantyEndDate\":\"2032-01-01\"");
        getAs(ALICE, "/v1/appliances/" + appliance + "/health").andExpect(jsonPath("$.status").value("NO_DEVICE"))
                .andExpect(jsonPath("$.service.underWarranty").value(true));

        var device = registerDevice(ALICE, appliance);
        seed(device.deviceId(), constant(T0.minus(Duration.ofHours(24)), 1440, 120));
        getAs(ALICE, "/v1/appliances/" + appliance + "/health")
                .andExpect(jsonPath("$.status").value("LEARNING")).andExpect(jsonPath("$.baselineStatus").value("NONE"))
                .andExpect(jsonPath("$.last24h.avgWatts").value(120.0))
                .andExpect(jsonPath("$.last24h.energyKwh").value(2.88))
                .andExpect(jsonPath("$.last24h.minutesWithData").value(1440))
                .andExpect(jsonPath("$.lastReadingAt").exists());

        alert(ALICE, appliance, AlertKind.POWER_SHIFT, Severity.WARNING);
        getAs(ALICE, "/v1/appliances/" + appliance + "/health").andExpect(jsonPath("$.status").value("WARNING"))
                .andExpect(jsonPath("$.activeAlerts", hasSize(1)));
        alert(ALICE, appliance, AlertKind.STUCK_ON, Severity.CRITICAL);
        getAs(ALICE, "/v1/appliances/" + appliance + "/health").andExpect(jsonPath("$.status").value("CRITICAL"))
                .andExpect(jsonPath("$.activeAlerts", hasSize(2)));
    }

    // ------------------------------------------------------------ reminders

    @Test
    void remindersCombineServiceDatesWarrantyAndLiveAlerts() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", ",\"nextServiceDate\":\"2031-01-05\",\"warrantyEndDate\":\"2031-02-01\"");
        createAppliance(ALICE, "WATER_PUMP", ",\"nextServiceDate\":\"2031-02-20\"");
        createAppliance(ALICE, "WASHING_MACHINE", ",\"nextServiceDate\":\"2032-06-01\",\"warrantyEndDate\":\"2030-01-01\"");

        String body = getAs(ALICE, "/v1/reminders").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<String> types = JsonPath.read(body, "$[*].type");
        assertThat(types).containsExactly("SERVICE_OVERDUE", "WARRANTY_ENDING", "SERVICE_DUE");   // far/expired ones omitted
        assertThat((Boolean) JsonPath.read(body, "$[0].highPriority")).isFalse();

        // an anomaly on the fridge while it is still under warranty jumps the queue
        alert(ALICE, fridge, AlertKind.POWER_SHIFT, Severity.WARNING);
        getAs(ALICE, "/v1/reminders").andExpect(jsonPath("$[0].highPriority").value(true))
                .andExpect(jsonPath("$[*].type", hasItem("WARRANTY_CLAIM_WINDOW")));
        getAs(ALICE, "/v1/reminders?days=400").andExpect(status().isBadRequest());
    }

    // ------------------------------------------------------------ cross-owner isolation

    @Test
    void userBCannotSeeOrTouchUserAsData() throws Exception {
        UUID appliance = createAppliance(ALICE, "FRIDGE", ",\"warrantyEndDate\":\"2032-01-01\",\"nextServiceDate\":\"2031-01-02\"");
        var device = registerDevice(ALICE, appliance);
        seed(device.deviceId(), constant(T0.minus(Duration.ofHours(2)), 120, 100));
        UUID alertId = alert(ALICE, appliance, AlertKind.STUCK_ON, Severity.WARNING);
        String a = "/v1/appliances/" + appliance;
        UUID bobsAppliance = createAppliance(BOB, "FRIDGE", "");

        // lists are empty for B
        getAs(BOB, "/v1/appliances").andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].id").value(bobsAppliance.toString()));
        getAs(BOB, "/v1/alerts?includeResolved=true").andExpect(jsonPath("$", hasSize(0)));
        getAs(BOB, "/v1/reminders").andExpect(jsonPath("$", hasSize(0)));

        // direct access by id is a 404 (not 403: B must not learn that the id exists)
        getAs(BOB, a).andExpect(status().isNotFound());
        getAs(BOB, a + "/health").andExpect(status().isNotFound());
        getAs(BOB, a + "/devices").andExpect(status().isNotFound());
        getAs(BOB, a + "/readings").andExpect(status().isNotFound());
        getAs(BOB, "/v1/alerts/" + alertId).andExpect(status().isNotFound());
        getAs(BOB, "/v1/alerts?applianceId=" + appliance).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(put(a).header("Authorization", bearer(BOB)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"hijacked\",\"type\":\"FRIDGE\"}")).andExpect(status().isNotFound());
        mvc.perform(delete(a).header("Authorization", bearer(BOB))).andExpect(status().isNotFound());
        mvc.perform(post(a + "/devices").header("Authorization", bearer(BOB)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"label\":\"evil\"}")).andExpect(status().isNotFound());
        mvc.perform(post(a + "/baseline/relearn").header("Authorization", bearer(BOB))).andExpect(status().isNotFound());
        mvc.perform(delete("/v1/devices/" + device.deviceId()).header("Authorization", bearer(BOB))).andExpect(status().isNotFound());
        mvc.perform(post("/v1/alerts/" + alertId + "/ack").header("Authorization", bearer(BOB))).andExpect(status().isNotFound());

        // ...and nothing of A's changed
        getAs(ALICE, a).andExpect(jsonPath("$.name").value("Kitchen FRIDGE"));
        getAs(ALICE, "/v1/alerts/" + alertId).andExpect(jsonPath("$.status").value("OPEN"));
        getAs(ALICE, a + "/devices").andExpect(jsonPath("$[0].active").value(true)).andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void unauthenticatedOwnerCallsAreRejectedAndHealthIsPublic() throws Exception {
        mvc.perform(get("/v1/appliances")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/alerts").header("Authorization", "Bearer garbage")).andExpect(status().isUnauthorized());
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
    }
}
