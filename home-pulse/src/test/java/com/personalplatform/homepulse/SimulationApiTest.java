package com.personalplatform.homepulse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.personalplatform.homepulse.eval.EvaluationService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@ExtendWith(OutputCaptureExtension.class)
class SimulationApiTest extends AbstractIntegrationTest {

    @Autowired EvaluationService evaluation;

    private ResultActions simulate(String uid, UUID appliance, String body) throws Exception {
        var req = post("/v1/appliances/" + appliance + "/simulation").header("Authorization", bearer(uid));
        if (body != null) {
            req = req.contentType(MediaType.APPLICATION_JSON).content(body);
        }
        return mvc.perform(req);
    }

    private ResultActions stop(String uid, UUID appliance) throws Exception {
        return mvc.perform(delete("/v1/appliances/" + appliance + "/simulation").header("Authorization", bearer(uid)));
    }

    private long count(String table) {
        return ((Number) dsl.fetchValue("select count(*) from home_pulse." + table)).longValue();
    }

    @Test
    void normalRunInsertsTheExpectedRowsAndLearnsABaseline(CapturedOutput out) throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");

        String body = simulate(ALICE, fridge, "{\"days\":7,\"scenario\":\"NORMAL\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.readingsInserted").value(7 * 288 + 1))
                .andExpect(jsonPath("$.baselineStatus").value("READY"))
                .andExpect(jsonPath("$.alertOpened").value(false))
                .andReturn().getResponse().getContentAsString();

        assertThat(count("readings")).isEqualTo(7 * 288 + 1);
        assertThat(count("devices")).isEqualTo(1);
        assertThat(count("alerts")).isZero();

        getAs(ALICE, "/v1/appliances/" + fridge + "/devices").andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].simulated").value(true))
                .andExpect(jsonPath("$[0].label").value("Built-in simulator"))
                .andExpect(jsonPath("$[0].active").value(true));
        getAs(ALICE, "/v1/appliances/" + fridge + "/health").andExpect(status().isOk())
                .andExpect(jsonPath("$.simulated").value(true))
                .andExpect(jsonPath("$.status").value("HEALTHY"))
                .andExpect(jsonPath("$.baselineStatus").value("READY"));
        getAs(ALICE, "/v1/appliances/" + fridge + "/readings?from=2031-01-15T06:00:00Z&to=2031-01-15T12:00:00Z")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.simulated").value(true))
                .andExpect(jsonPath("$.points.length()").value(72));

        assertThat(body).doesNotContain("hpd_");
        assertThat(out.getAll()).doesNotContain("hpd_");
        assertThat(dsl.fetchValue("select token_prefix from home_pulse.devices").toString()).startsWith("hpd_");
    }

    @Test
    void defaultsAreSevenDaysAndNormalWhenNoBodyIsSent() throws Exception {
        UUID pump = createAppliance(ALICE, "WATER_PUMP", "");
        simulate(ALICE, pump, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.readingsInserted").value(7 * 288 + 1))
                .andExpect(jsonPath("$.alertOpened").value(false));
        simulate(ALICE, pump, "{}").andExpect(status().isOk())
                .andExpect(jsonPath("$.readingsInserted").value(7 * 288 + 1));
    }

    @Test
    void everyApplianceTypeLearnsABaselineWithoutAlerts() throws Exception {
        for (String type : new String[] {"FRIDGE", "AIR_CONDITIONER", "WATER_PUMP", "WASHING_MACHINE", "OTHER"}) {
            UUID id = createAppliance(ALICE, type, "");
            simulate(ALICE, id, "{\"days\":7}").andExpect(status().isOk())
                    .andExpect(jsonPath("$.baselineStatus").value("READY"))
                    .andExpect(jsonPath("$.alertOpened").value(false));
        }
    }

    @Test
    void anomalyScenarioOpensAnAlertThatTheAlertsApiShows() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        simulate(ALICE, fridge, "{\"days\":7,\"scenario\":\"ANOMALY\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.baselineStatus").value("READY"))
                .andExpect(jsonPath("$.alertOpened").value(true));

        getAs(ALICE, "/v1/alerts").andExpect(status().isOk())
                .andExpect(jsonPath("$[*].kind", hasItem("STUCK_ON")))
                .andExpect(jsonPath("$[0].simulated").value(true))
                .andExpect(jsonPath("$[0].decidedBy").value("MAD"));     // no ML_SERVICE_URL: built-in detector
        getAs(ALICE, "/v1/appliances/" + fridge + "/health")
                .andExpect(jsonPath("$.simulated").value(true))
                .andExpect(jsonPath("$.activeAlerts[0].simulated").value(true));
    }

    @Test
    void anomalyWorksForEveryApplianceType() throws Exception {
        for (String type : new String[] {"FRIDGE", "AIR_CONDITIONER", "WATER_PUMP", "WASHING_MACHINE", "OTHER"}) {
            UUID id = createAppliance(ALICE, type, "");
            simulate(ALICE, id, "{\"days\":10,\"scenario\":\"ANOMALY\"}").andExpect(status().isOk())
                    .andExpect(jsonPath("$.alertOpened").value(true));
        }
    }

    @Test
    void repeatingIsIdempotent() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        for (int i = 0; i < 3; i++) {
            simulate(ALICE, fridge, "{\"days\":7,\"scenario\":\"ANOMALY\"}").andExpect(status().isOk())
                    .andExpect(jsonPath("$.readingsInserted").value(7 * 288 + 1))
                    .andExpect(jsonPath("$.alertOpened").value(true));
            assertThat(count("readings")).isEqualTo(7 * 288 + 1);
            assertThat(count("devices")).isEqualTo(1);
            assertThat(dsl.fetchValue("select count(*) from home_pulse.alerts where status in ('OPEN','ACKNOWLEDGED')"))
                    .isEqualTo(1L);
        }
    }

    @Test
    void runningAgainWithAnotherScenarioReplacesTheSimulatedHistory() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        simulate(ALICE, fridge, "{\"scenario\":\"ANOMALY\"}").andExpect(jsonPath("$.alertOpened").value(true));
        simulate(ALICE, fridge, "{\"scenario\":\"NORMAL\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.alertOpened").value(false));
        assertThat(count("readings")).isEqualTo(7 * 288 + 1);
        getAs(ALICE, "/v1/alerts").andExpect(jsonPath("$", hasSize(0)));
        getAs(ALICE, "/v1/appliances/" + fridge + "/health").andExpect(jsonPath("$.status").value("HEALTHY"));
    }

    @Test
    void shortHistoriesLearnFromWhatThereIsOrStayLearning() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        simulate(ALICE, fridge, "{\"days\":1}").andExpect(status().isOk())
                .andExpect(jsonPath("$.readingsInserted").value(289))
                .andExpect(jsonPath("$.baselineStatus").value("LEARNING"))
                .andExpect(jsonPath("$.alertOpened").value(false));
    }

    @Test
    void deleteRemovesDeviceReadingsBaselineAndSimulatedAlerts() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        simulate(ALICE, fridge, "{\"scenario\":\"ANOMALY\"}").andExpect(status().isOk());
        assertThat(count("readings")).isPositive();

        stop(ALICE, fridge).andExpect(status().isNoContent());

        assertThat(count("readings")).isZero();
        assertThat(count("devices")).isZero();
        assertThat(count("baselines")).isZero();
        assertThat(dsl.fetchValue("select count(*) from home_pulse.alerts where status in ('OPEN','ACKNOWLEDGED')"))
                .isEqualTo(0L);
        getAs(ALICE, "/v1/appliances/" + fridge + "/devices").andExpect(jsonPath("$", hasSize(0)));
        getAs(ALICE, "/v1/appliances/" + fridge + "/health").andExpect(jsonPath("$.status").value("NO_DEVICE"))
                .andExpect(jsonPath("$.simulated").value(false));

        stop(ALICE, fridge).andExpect(status().isNoContent());      // nothing left to remove: still fine
        simulate(ALICE, fridge, "{}").andExpect(status().isOk());   // and it can be started again
    }

    @Test
    void deleteLeavesAlertsOfRealDataAlone() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        simulate(ALICE, fridge, "{}").andExpect(status().isOk());
        dsl.execute("insert into home_pulse.alerts (id, owner_uid, appliance_id, kind, severity, status, message, evidence, "
                + "opened_at, updated_at) values (?, ?, ?, 'NO_DATA', 'WARNING', 'OPEN', 'real', '{}'::jsonb, now(), now())",
                UUID.randomUUID(), ALICE, fridge);
        stop(ALICE, fridge).andExpect(status().isNoContent());
        assertThat(dsl.fetchValue("select count(*) from home_pulse.alerts where status = 'OPEN' and message = 'real'"))
                .isEqualTo(1L);
    }

    @Test
    void anApplianceWithARealDeviceIsRefusedAndLeftUntouched() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        registerDevice(ALICE, fridge);
        simulate(ALICE, fridge, "{}").andExpect(status().isConflict());
        assertThat(count("readings")).isZero();
        assertThat(count("devices")).isEqualTo(1);
        assertThat(dsl.fetchValue("select simulated from home_pulse.devices")).isEqualTo(false);
        stop(ALICE, fridge).andExpect(status().isNoContent());     // never touches a real device
        assertThat(count("devices")).isEqualTo(1);
    }

    @Test
    void aRevokedRealDeviceDoesNotBlockTheSimulator() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        var real = registerDevice(ALICE, fridge);
        mvc.perform(delete("/v1/devices/" + real.deviceId()).header("Authorization", bearer(ALICE)))
                .andExpect(status().isNoContent());
        simulate(ALICE, fridge, "{}").andExpect(status().isOk());
        stop(ALICE, fridge).andExpect(status().isNoContent());
        assertThat(count("devices")).isEqualTo(1);   // the revoked real one stays as history
    }

    @Test
    void otherUsersGetNotFoundAndSeeNothing() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        simulate(BOB, fridge, "{}").andExpect(status().isNotFound());
        assertThat(count("readings")).isZero();

        simulate(ALICE, fridge, "{\"scenario\":\"ANOMALY\"}").andExpect(status().isOk());
        stop(BOB, fridge).andExpect(status().isNotFound());
        assertThat(count("readings")).isPositive();
        getAs(BOB, "/v1/appliances/" + fridge + "/readings").andExpect(status().isNotFound());
        getAs(BOB, "/v1/appliances/" + fridge + "/health").andExpect(status().isNotFound());
        getAs(BOB, "/v1/alerts").andExpect(jsonPath("$", hasSize(0)));
        simulate(ALICE, UUID.randomUUID(), "{}").andExpect(status().isNotFound());
    }

    @Test
    void requiresAnOwnerToken() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        mvc.perform(post("/v1/appliances/" + fridge + "/simulation").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(delete("/v1/appliances/" + fridge + "/simulation")).andExpect(status().isUnauthorized());
    }

    @Test
    void daysAreLimitedToOneThroughFourteen() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        simulate(ALICE, fridge, "{\"days\":0}").andExpect(status().isBadRequest());
        simulate(ALICE, fridge, "{\"days\":-3}").andExpect(status().isBadRequest());
        simulate(ALICE, fridge, "{\"days\":15}").andExpect(status().isBadRequest());
        simulate(ALICE, fridge, "{\"scenario\":\"CHAOS\"}").andExpect(status().isBadRequest());
        simulate(ALICE, fridge, "{\"days\":\"many\"}").andExpect(status().isBadRequest());
        assertThat(count("devices")).isZero();
        simulate(ALICE, fridge, "{\"days\":14}").andExpect(status().isOk())
                .andExpect(jsonPath("$.readingsInserted").value(14 * 288 + 1));
    }

    @Test
    void theSimulatedDeviceIsNotEvaluatedBySchedulerAndItsTokenWorksNowhere(CapturedOutput out) throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        simulate(ALICE, fridge, "{}").andExpect(status().isOk());
        assertThat(evaluation.applianceIdsToEvaluate()).doesNotContain(fridge);

        // only a hash is stored: 64 hex characters, never the plaintext
        String hash = dsl.fetchValue("select token_hash from home_pulse.devices").toString().trim();
        assertThat(hash).matches("[0-9a-f]{64}");
        assertThat(out.getAll()).doesNotContain("hpd_").doesNotContain(hash);
    }
}
