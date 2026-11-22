package com.personalplatform.homepulse.manual;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.personalplatform.homepulse.AbstractIntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/** Manual readings end to end: meter totals, CSV import, the conflicts with a real plug, and no mixing of sources. */
class ManualReadingsApiTest extends AbstractIntegrationTest {

    /** Interval endpoints are relative to the test clock (2031-01-15T12:00Z). */
    private static final String T_MINUS_60 = "2031-01-15T11:00:00Z";
    private static final String T_MINUS_30 = "2031-01-15T11:30:00Z";
    private static final String NOW = "2031-01-15T12:00:00Z";

    private ResultActions meter(String uid, UUID appliance, String body) throws Exception {
        return mvc.perform(post("/v1/appliances/" + appliance + "/meter-readings")
                .header("Authorization", bearer(uid)).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions csv(String uid, UUID appliance, String csv) throws Exception {
        String body = "{\"csv\":" + quote(csv) + "}";
        return mvc.perform(post("/v1/appliances/" + appliance + "/readings/import")
                .header("Authorization", bearer(uid)).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    /** Minimal JSON string escaping for the test bodies. */
    private static String quote(String text) {
        return "\"" + text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }

    private long readingCount() {
        return ((Number) dsl.fetchValue("select count(*) from home_pulse.readings")).longValue();
    }

    @Test
    void theFirstTotalIsABaselineAndTheNextOneBecomesAverageWatts() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");

        meter(ALICE, fridge, "{\"kwh\":100.0,\"at\":\"" + T_MINUS_60 + "\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.outcome").value("BASELINE"))
                .andExpect(jsonPath("$.averageWatts").doesNotExist())
                .andExpect(jsonPath("$.minutesStored").value(0));
        assertThat(readingCount()).isZero();

        // 0.5 kWh over 30 minutes: exactly 1000 W, stored as one reading per minute
        meter(ALICE, fridge, "{\"kwh\":100.5,\"at\":\"" + T_MINUS_30 + "\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.outcome").value("RECORDED"))
                .andExpect(jsonPath("$.intervalMinutes").value(30))
                .andExpect(jsonPath("$.energyKwh").value(0.5))
                .andExpect(jsonPath("$.averageWatts").value(1000.0))
                .andExpect(jsonPath("$.minutesStored").value(30))
                .andExpect(jsonPath("$.minutesRejected").value(0));
        assertThat(readingCount()).isEqualTo(30);

        getAs(ALICE, "/v1/appliances/" + fridge + "/devices")
                .andExpect(jsonPath("$[0].manual").value(true))
                .andExpect(jsonPath("$[0].simulated").value(false))
                .andExpect(jsonPath("$[0].label").value("Entered by you"));
        getAs(ALICE, "/v1/appliances/" + fridge + "/health")
                .andExpect(jsonPath("$.source").value("MANUAL"))
                .andExpect(jsonPath("$.simulated").value(false))
                .andExpect(jsonPath("$.status").value("LEARNING"))
                .andExpect(jsonPath("$.last24h.energyKwh").value(0.5))
                .andExpect(jsonPath("$.last24h.avgWatts").value(1000.0));
        getAs(ALICE, "/v1/appliances/" + fridge + "/readings?from=" + T_MINUS_60 + "&to=" + NOW)
                .andExpect(jsonPath("$.source").value("MANUAL"))
                .andExpect(jsonPath("$.simulated").value(false))
                .andExpect(jsonPath("$.points.length()").value(30))
                .andExpect(jsonPath("$.points[0].avgWatts").value(1000.0));
    }

    @Test
    void theMeterTotalCanOnlyGoUpAndTimeMustMoveForward() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        meter(ALICE, fridge, "{\"kwh\":100.0,\"at\":\"" + T_MINUS_60 + "\"}").andExpect(status().isOk());
        meter(ALICE, fridge, "{\"kwh\":100.5,\"at\":\"" + T_MINUS_30 + "\"}").andExpect(status().isOk());

        meter(ALICE, fridge, "{\"kwh\":100.2,\"at\":\"2031-01-15T11:45:00Z\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("only goes up")));
        meter(ALICE, fridge, "{\"kwh\":101.0,\"at\":\"" + T_MINUS_30 + "\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("time order")));
        meter(ALICE, fridge, "{\"kwh\":101.0,\"at\":\"2031-01-15T13:00:00Z\"}")
                .andExpect(status().isBadRequest());
        meter(ALICE, fridge, "{\"kwh\":-1}").andExpect(status().isBadRequest());
        meter(ALICE, fridge, "{}").andExpect(status().isBadRequest());
        // nothing from the refused requests was stored
        assertThat(readingCount()).isEqualTo(30);
    }

    @Test
    void aMeterTotalAfterALongGapStoresTheTotalButInventsNoReadings() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        meter(ALICE, fridge, "{\"kwh\":100.0,\"at\":\"2031-01-15T05:00:00Z\"}").andExpect(status().isOk());
        // five hours of nobody measuring: 10 kWh is real, but spreading it would invent 300 minutes of readings
        meter(ALICE, fridge, "{\"kwh\":110.0,\"at\":\"2031-01-15T10:00:00Z\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.outcome").value("RECORDED"))
                .andExpect(jsonPath("$.spread").value(false))
                .andExpect(jsonPath("$.intervalMinutes").value(300))
                .andExpect(jsonPath("$.minutesStored").value(0))
                .andExpect(jsonPath("$.minutesRejected").value(0));
        assertThat(readingCount()).isZero();

        // the next total, 90 minutes later, is spread as usual: the gap stays empty, the new interval is filled
        meter(ALICE, fridge, "{\"kwh\":110.5,\"at\":\"2031-01-15T11:30:00Z\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.spread").value(true))
                .andExpect(jsonPath("$.minutesStored").value(90));
        assertThat(readingCount()).isEqualTo(90);
        assertThat(((Number) dsl.fetchValue("select count(*) from home_pulse.readings where ts <= timestamptz '2031-01-15T10:00:00Z'")).longValue())
                .isZero();
    }

    @Test
    void aMeterTotalOlderThanTheAcceptedWindowIsCountedAsRejectedNotStored() throws Exception {
        UUID pump = createAppliance(ALICE, "WATER_PUMP", "");
        // The window opens 30 days before the test clock (2030-12-16T12:00Z). The 2-hour interval from 11:00 keeps
        // its last hour; the first hour is counted as rejected, not stored.
        meter(ALICE, pump, "{\"kwh\":10.0,\"at\":\"2030-12-16T11:00:00Z\"}").andExpect(status().isOk());
        meter(ALICE, pump, "{\"kwh\":10.2,\"at\":\"2030-12-16T13:00:00Z\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.intervalMinutes").value(120))
                .andExpect(jsonPath("$.averageWatts").value(org.hamcrest.Matchers.closeTo(100.0, 1e-6)))
                .andExpect(jsonPath("$.minutesRejected").value(60))
                .andExpect(jsonPath("$.minutesStored").value(60));
        assertThat(readingCount()).isEqualTo(60);
    }

    @Test
    void csvWithKWhAndVoltsIsAveragedOverEachIntervalAndKeepsVolts() throws Exception {
        UUID dryer = createAppliance(ALICE, "OTHER", "");
        csv(ALICE, dryer, "timestamp,kwh,volts\n"
                        + "2031-01-15T10:00:00Z,0.0,229\n"   // starting time only
                        + "2031-01-15T10:30:00Z,0.5,230\n"   // 0.5 kWh over 30 min = 1000 W
                        + "2031-01-15T10:45:00Z,0.25,231\n") // 0.25 kWh over 15 min = 1000 W
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows").value(2))
                .andExpect(jsonPath("$.accepted").value(45));
        assertThat(readingCount()).isEqualTo(45);
        assertThat(((Number) dsl.fetchValue("select count(*) from home_pulse.readings where watts = 1000 and volts = 230")).longValue())
                .isEqualTo(30);
        assertThat(((Number) dsl.fetchValue("select count(*) from home_pulse.readings where watts = 1000 and volts = 231")).longValue())
                .isEqualTo(15);
    }

    @Test
    void csvWithAGapOfMoreThanTwoHoursIsRefusedWholeAndNothingIsInvented() throws Exception {
        UUID dryer = createAppliance(ALICE, "OTHER", "");
        csv(ALICE, dryer, "timestamp,kwh\n2031-01-15T06:00:00Z,0\n2031-01-15T12:00:00Z,1\n")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("line 3: the interval since the previous row is 6 hours")));
        csv(ALICE, dryer, "2031-01-15T10:00:00+01:00,100\n2031-01-15T10:00:00,100\n")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("line 2: the timestamp has no time zone")));
        assertThat(readingCount()).isZero();
    }

    @Test
    void importStoresEveryRowOrNothingAndCountsDuplicates() throws Exception {
        UUID washer = createAppliance(ALICE, "WASHING_MACHINE", "");
        String good = "timestamp,watts\n"
                + "2031-01-15T10:00:00Z,100.5\n"
                + "2031-01-15T10:01:00+00:00,101\n"
                + "2031-01-15T10:02:00+01:00,99.5\n";
        csv(ALICE, washer, good)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows").value(3))
                .andExpect(jsonPath("$.accepted").value(3))
                .andExpect(jsonPath("$.duplicates").value(0))
                .andExpect(jsonPath("$.rejected").value(0));
        csv(ALICE, washer, good)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accepted").value(0))
                .andExpect(jsonPath("$.duplicates").value(3));
        csv(ALICE, washer, "2030-01-01T00:00:00Z,50\n2031-01-15T10:05:00Z,60\n")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows").value(2))
                .andExpect(jsonPath("$.accepted").value(1))
                .andExpect(jsonPath("$.rejected").value(1));
        assertThat(readingCount()).isEqualTo(4);

        UUID dryer = createAppliance(ALICE, "OTHER", "");
        csv(ALICE, dryer, "2031-01-15T10:00:00Z,100\nno-zone,5\n")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("line 2")));
        csv(ALICE, dryer, "   ")
                .andExpect(status().isBadRequest());
        // the refused file stored nothing and created no manual device for the appliance
        assertThat(readingCount()).isEqualTo(4);
        getAs(ALICE, "/v1/appliances/" + dryer + "/devices").andExpect(jsonPath("$", org.hamcrest.Matchers.hasSize(0)));
    }

    @Test
    void aRealPlugOrTheSimulatorBlocksManualEntry() throws Exception {
        UUID plugged = createAppliance(ALICE, "FRIDGE", "");
        registerDevice(ALICE, plugged);
        meter(ALICE, plugged, "{\"kwh\":1}").andExpect(status().isConflict());
        csv(ALICE, plugged, "2031-01-15T10:00:00Z,1\n").andExpect(status().isConflict());

        UUID simulated = createAppliance(ALICE, "AIR_CONDITIONER", "");
        mvc.perform(post("/v1/appliances/" + simulated + "/simulation").header("Authorization", bearer(ALICE))
                .contentType(MediaType.APPLICATION_JSON).content("{\"days\":1}")).andExpect(status().isOk());
        meter(ALICE, simulated, "{\"kwh\":1}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("simulator")));
    }

    @Test
    void theOwnerNeverSeesAnotherOwnersAppliance() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        meter(BOB, fridge, "{\"kwh\":1}").andExpect(status().isNotFound());
        csv(BOB, fridge, "2031-01-15T10:00:00Z,1\n").andExpect(status().isNotFound());
    }

    @Test
    void manualReadingsNeverMixWithARealPlugsHistoryOrTheSimulator() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        var plug = registerDevice(ALICE, fridge);
        // one real reading far in the past, distinguishable from anything the simulator makes
        mvc.perform(post("/v1/ingest/readings").header("Authorization", "Bearer " + plug.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"readings\":[{\"ts\":\"2031-01-10T00:00:00Z\",\"watts\":999.0}]}"))
                .andExpect(status().isOk());
        mvc.perform(delete("/v1/devices/" + plug.deviceId()).header("Authorization", bearer(ALICE)))
                .andExpect(status().isNoContent());

        // a simulated run on the same appliance answers with simulated readings only
        mvc.perform(post("/v1/appliances/" + fridge + "/simulation").header("Authorization", bearer(ALICE))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"days\":1}"))
                .andExpect(status().isOk());
        getAs(ALICE, "/v1/appliances/" + fridge + "/readings?from=2031-01-09T00:00:00Z&to=" + NOW + "&resolution=ONE_HOUR")
                .andExpect(jsonPath("$.source").value("SIMULATED"))
                .andExpect(jsonPath("$.simulated").value(true))
                .andExpect(jsonPath("$.points[?(@.maxWatts > 500)]").value(org.hamcrest.Matchers.hasSize(0)));

        // when the simulation stops, the real history of the revoked plug is still there, labelled as a device
        mvc.perform(delete("/v1/appliances/" + fridge + "/simulation").header("Authorization", bearer(ALICE)))
                .andExpect(status().isNoContent());
        getAs(ALICE, "/v1/appliances/" + fridge + "/readings?from=2031-01-09T00:00:00Z&to=" + NOW + "&resolution=ONE_HOUR")
                .andExpect(jsonPath("$.source").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.simulated").value(false))
                .andExpect(jsonPath("$.points[?(@.maxWatts == 999.0)]").value(org.hamcrest.Matchers.hasSize(1)));

        // and manual entry starts cleanly on the same appliance, without the plug's old totals
        meter(ALICE, fridge, "{\"kwh\":5,\"at\":\"" + T_MINUS_60 + "\"}")
                .andExpect(jsonPath("$.outcome").value("BASELINE"));
    }
}
