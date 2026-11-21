package com.personalplatform.homepulse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.personalplatform.homepulse.detect.MinuteSample;
import com.personalplatform.homepulse.eval.BaselineRepository;
import com.personalplatform.homepulse.eval.EvaluationJob;
import com.personalplatform.homepulse.sim.ApplianceSimulator;
import com.personalplatform.homepulse.sim.ApplianceSimulator.Degradation;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * The whole pipeline on real TimescaleDB: simulated raw readings -> hypertable -> real-time continuous aggregate ->
 * scheduled evaluation (baseline learning, detector, alert dedup / auto-resolve) -> owner APIs. The clock is manual.
 */
class EvaluationIntegrationTest extends AbstractIntegrationTest {

    private static final Instant T0 = TestSupportConfig.T0;
    /** 14 days of history before T0, 2 days after (the clock decides what the evaluator may see). */
    private static final Instant START = T0.minus(Duration.ofDays(14));

    @Autowired EvaluationJob job;
    @Autowired BaselineRepository baselines;

    private record Setup(UUID applianceId, UUID deviceId) {}

    private Setup fridgeWith(List<MinuteSample> samples) throws Exception {
        clock.set(START.minus(Duration.ofHours(1)));              // registered just before the first reading
        UUID appliance = createAppliance(ALICE, "FRIDGE", ",\"warrantyEndDate\":\"2031-03-01\"");
        var device = registerDevice(ALICE, appliance);
        seed(device.deviceId(), samples);
        clock.set(T0);
        return new Setup(appliance, device.deviceId());
    }

    private static List<MinuteSample> healthyFridge() {
        return ApplianceSimulator.fridge(START, 16, 7, Degradation.NONE);
    }

    @Test
    void healthyApplianceLearnsABaselineAndRaisesNothing() throws Exception {
        var s = fridgeWith(healthyFridge());
        assertThat(job.runOnce()).isEqualTo(new EvaluationJob.Summary(1, 0));
        for (int i = 0; i < 3; i++) {
            clock.advance(Duration.ofMinutes(5));
            job.runOnce();
        }
        var baseline = baselines.find(s.applianceId()).orElseThrow();
        assertThat(baseline.status()).isEqualTo(BaselineRepository.Status.READY);
        assertThat(baseline.stats().onLevelMedian()).isBetween(110.0, 120.0);
        getAs(ALICE, "/v1/alerts?includeResolved=true").andExpect(jsonPath("$", hasSize(0)));
        getAs(ALICE, "/v1/appliances/" + s.applianceId() + "/health")
                .andExpect(jsonPath("$.status").value("HEALTHY")).andExpect(jsonPath("$.baselineStatus").value("READY"))
                .andExpect(jsonPath("$.baseline.switching").value(true))
                .andExpect(jsonPath("$.last24h.dutyPct").exists());
    }

    @Test
    void stuckOnOpensExactlyOneAlertThatAutoResolvesWhenTheUnitCyclesAgain() throws Exception {
        var data = ApplianceSimulator.stuckOn(healthyFridge(), T0.minus(Duration.ofHours(5)), T0.plus(Duration.ofHours(2)), 118, 3);
        var s = fridgeWith(data);

        job.runOnce();                                   // learns the baseline and sees 5 h of never-off
        job.runOnce();
        clock.advance(Duration.ofMinutes(5));
        job.runOnce();                                   // three runs, one alert
        String list = getAs(ALICE, "/v1/alerts").andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].kind").value("STUCK_ON")).andExpect(jsonPath("$[0].status").value("OPEN"))
                .andExpect(jsonPath("$[0].applianceId").value(s.applianceId().toString()))
                .andExpect(jsonPath("$[0].underWarranty").value(true))
                .andReturn().getResponse().getContentAsString();
        String alertId = com.jayway.jsonpath.JsonPath.read(list, "$[0].id");
        getAs(ALICE, "/v1/appliances/" + s.applianceId() + "/health").andExpect(jsonPath("$.status").value("WARNING"));
        getAs(ALICE, "/v1/reminders").andExpect(jsonPath("$[0].type").value("WARRANTY_CLAIM_WINDOW"));

        mvc.perform(post("/v1/alerts/" + alertId + "/ack").header("Authorization", bearer(ALICE)))
                .andExpect(jsonPath("$.status").value("ACKNOWLEDGED"));
        job.runOnce();                                   // still stuck: acknowledged alert is refreshed, not duplicated
        getAs(ALICE, "/v1/alerts").andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].status").value("ACKNOWLEDGED"));

        // the unit starts cycling normally again (data after T0 + 2 h is healthy); three clean runs resolve it
        clock.set(T0.plus(Duration.ofHours(6)));
        job.runOnce();
        getAs(ALICE, "/v1/alerts").andExpect(jsonPath("$", hasSize(1)));    // hysteresis: one clean run is not enough
        job.runOnce();
        job.runOnce();
        getAs(ALICE, "/v1/alerts").andExpect(jsonPath("$", hasSize(0)));
        getAs(ALICE, "/v1/alerts?includeResolved=true").andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].status").value("RESOLVED")).andExpect(jsonPath("$[0].resolvedAt").exists());
        getAs(ALICE, "/v1/appliances/" + s.applianceId() + "/health").andExpect(jsonPath("$.status").value("HEALTHY"));
    }

    @Test
    void silentSensorRaisesNoDataAndClearsWhenReadingsResume() throws Exception {
        List<MinuteSample> all = healthyFridge();
        var s = fridgeWith(ApplianceSimulator.upTo(all, T0.minus(Duration.ofHours(3))));
        job.runOnce();
        getAs(ALICE, "/v1/alerts").andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].kind").value("NO_DATA"))
                .andExpect(jsonPath("$[0].severity").value("WARNING"));

        seed(s.deviceId(), all.stream().filter(m -> !m.ts().isBefore(T0.minus(Duration.ofHours(3))) && m.ts().isBefore(T0)).toList());
        job.runOnce();
        job.runOnce();
        job.runOnce();
        getAs(ALICE, "/v1/alerts?includeResolved=true").andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].status").value("RESOLVED"));
    }

    @Test
    void deviceThatNeverReportedIsFlagged() throws Exception {
        clock.set(T0.minus(Duration.ofHours(3)));
        UUID appliance = createAppliance(ALICE, "FRIDGE", "");
        registerDevice(ALICE, appliance);
        clock.set(T0.minus(Duration.ofHours(3)).plus(Duration.ofMinutes(20)));
        job.runOnce();
        getAs(ALICE, "/v1/alerts").andExpect(jsonPath("$", hasSize(0)));          // grace period
        clock.set(T0);
        job.runOnce();
        getAs(ALICE, "/v1/alerts").andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].kind").value("NO_DATA"));
    }

    @Test
    void tooLittleHistoryMeansLearningAndNoJudgement() throws Exception {
        clock.set(T0.minus(Duration.ofDays(3)));
        UUID appliance = createAppliance(ALICE, "FRIDGE", "");
        var device = registerDevice(ALICE, appliance);
        seed(device.deviceId(), ApplianceSimulator.fridge(T0.minus(Duration.ofDays(3)), 3, 5, Degradation.NONE));
        clock.set(T0);
        job.runOnce();
        assertThat(baselines.find(appliance).orElseThrow().status()).isEqualTo(BaselineRepository.Status.LEARNING);
        getAs(ALICE, "/v1/alerts").andExpect(jsonPath("$", hasSize(0)));
        getAs(ALICE, "/v1/appliances/" + appliance + "/health").andExpect(jsonPath("$.status").value("LEARNING"));
    }

    @Test
    void relearnResolvesJudgementAlertsAndRestartsLearning() throws Exception {
        var data = ApplianceSimulator.stuckOn(healthyFridge(), T0.minus(Duration.ofHours(5)), T0.plus(Duration.ofHours(2)), 118, 3);
        var s = fridgeWith(data);
        job.runOnce();
        getAs(ALICE, "/v1/alerts").andExpect(jsonPath("$", hasSize(1)));

        mvc.perform(post("/v1/appliances/" + s.applianceId() + "/baseline/relearn").header("Authorization", bearer(ALICE)))
                .andExpect(status().isAccepted());
        getAs(ALICE, "/v1/alerts").andExpect(jsonPath("$", hasSize(0)));
        assertThat(baselines.find(s.applianceId()).orElseThrow().status()).isEqualTo(BaselineRepository.Status.LEARNING);
        job.runOnce();   // learning again: nothing is judged
        getAs(ALICE, "/v1/alerts").andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void revokedDeviceIsNoLongerEvaluated() throws Exception {
        var s = fridgeWith(healthyFridge());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/v1/devices/" + s.deviceId())
                .header("Authorization", bearer(ALICE))).andExpect(status().isNoContent());
        assertThat(job.runOnce()).isEqualTo(new EvaluationJob.Summary(0, 0));
    }
}
