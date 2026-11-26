package com.personalplatform.homepulse.ml;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.homepulse.detect.AlertKind;
import com.personalplatform.homepulse.detect.AnomalyDetector;
import com.personalplatform.homepulse.detect.AnomalyModel;
import com.personalplatform.homepulse.detect.ApplianceType;
import com.personalplatform.homepulse.detect.Baseline;
import com.personalplatform.homepulse.detect.BaselineLearner;
import com.personalplatform.homepulse.detect.DecidedBy;
import com.personalplatform.homepulse.detect.DetectorProfile;
import com.personalplatform.homepulse.detect.Finding;
import com.personalplatform.homepulse.detect.MadAnomalyModel;
import com.personalplatform.homepulse.detect.MinuteSample;
import com.personalplatform.homepulse.sim.ApplianceSimulator;
import com.personalplatform.homepulse.sim.ApplianceSimulator.Degradation;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The ml-service seam against a stubbed ml-service (a real HTTP server, so timeouts, status codes and JSON are the
 * real ones): who decides, and the fallback to the built-in detector on timeout, 5xx, refused connections, an
 * untrained or stale model and features ml-service could not judge.
 */
class MlAnomalyModelTest {

    static final Instant START = Instant.parse("2031-03-01T00:00:00Z");
    static final Instant LEARNED_TO = START.plus(7, ChronoUnit.DAYS);
    static final DetectorProfile FRIDGE = DetectorProfile.forType(ApplianceType.FRIDGE);
    static final UUID APPLIANCE = UUID.fromString("00000000-0000-4000-8000-000000000001");

    record Reply(int status, String body, long delayMs) {}

    HttpServer server;
    final Deque<Reply> replies = new ArrayDeque<>();
    final List<String> requests = new CopyOnWriteArrayList<>();
    final AtomicInteger trainCalls = new AtomicInteger();
    final SimpleMeterRegistry meters = new SimpleMeterRegistry();

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", this::handle);
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private synchronized Reply next() {
        return replies.isEmpty() ? new Reply(500, "{}", 0) : replies.poll();
    }

    private void handle(HttpExchange ex) throws IOException {
        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String path = ex.getRequestURI().getPath();
        requests.add(path + " " + (body.length() > 400 ? body.substring(body.length() - 400) : body));
        if (path.endsWith("/train")) {
            trainCalls.incrementAndGet();
        }
        Reply r = next();
        if (r.delayMs() > 0) {
            try {
                Thread.sleep(r.delayMs());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        byte[] out = r.body().getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(r.status(), out.length);
        ex.getResponseBody().write(out);
        ex.close();
    }

    private MlAnomalyModel model(String url) {
        return new MlAnomalyModel(new MlServiceClient(url, Duration.ofMillis(500), Duration.ofSeconds(5)),
                new MadAnomalyModel(), Duration.ofMinutes(10), meters);
    }

    private MlAnomalyModel model() {
        return model("http://127.0.0.1:" + server.getAddress().getPort());
    }

    // ------------------------------------------------------------------ data

    /** A fridge whose ON power steps up 25% two days after learning: the built-in detector finds POWER_SHIFT. */
    static final List<MinuteSample> SHIFTED = ApplianceSimulator.fridge(START, 12, 7,
            t -> t.isBefore(START.plus(9, ChronoUnit.DAYS)) ? 0.0 : 0.25, t -> 0.0);
    static final List<MinuteSample> HEALTHY = ApplianceSimulator.fridge(START, 12, 7, Degradation.NONE);
    static final Baseline BASELINE = BaselineLearner.learn(
            ApplianceSimulator.upTo(HEALTHY, LEARNED_TO), FRIDGE, START, LEARNED_TO).orElseThrow();
    static final Instant NOW = START.plus(11, ChronoUnit.DAYS);

    private static AnomalyModel.Input input(List<MinuteSample> all, Instant now, Set<AlertKind> live) {
        List<MinuteSample> recent = all.stream()
                .filter(s -> !s.ts().isBefore(now.minus(Duration.ofHours(48))) && s.ts().isBefore(now)).toList();
        return new AnomalyModel.Input(APPLIANCE, ApplianceType.FRIDGE, FRIDGE, BASELINE, recent,
                recent.get(recent.size() - 1).ts(), now, live, () -> ApplianceSimulator.upTo(HEALTHY, LEARNED_TO));
    }

    private static String score(boolean powerEvaluated, boolean powerAnomalous, boolean dutyEvaluated) {
        return """
                {"status":"ok","evaluated":true,"anomalous":%s,"model_version":"seasonal-robust-z/1","score":1.4,
                 "features":[
                  {"name":"on_power","kind":"POWER_SHIFT","evaluated":%s,"anomalous":%s,"statistic":5.6,"threshold":4.0,
                   "score":1.4,"direction":1,"observed":131.2,"expected":115.0,"change_pct":14.1,"z":[5.6,5.9,6.0]},
                  {"name":"duty","kind":"DUTY_CYCLE_DRIFT","evaluated":%s,"anomalous":false,"statistic":0.5,
                   "threshold":4.0,"score":0.1,"direction":0,"observed":0.36,"expected":0.35,"change_pct":2.0},
                  {"name":"cycle_minutes","kind":"DUTY_CYCLE_DRIFT","evaluated":%s,"anomalous":false,"statistic":0.3,
                   "threshold":4.5,"score":0.07,"direction":0,"observed":24.0,"expected":24.4,"change_pct":-1.0}]}
                """.formatted(powerAnomalous, powerEvaluated, powerAnomalous, dutyEvaluated, dutyEvaluated);
    }

    private static Optional<Finding> finding(AnomalyDetector.Evaluation e, AlertKind kind) {
        return e.findings().stream().filter(f -> f.kind() == kind).findFirst();
    }

    // ------------------------------------------------------------------ the built-in detector alone

    @Test
    void builtInDetectorFindsTheShiftOnItsOwn() {
        var e = new MadAnomalyModel().evaluate(input(SHIFTED, NOW, Set.of()));
        assertThat(finding(e, AlertKind.POWER_SHIFT)).get().extracting(Finding::decidedBy).isEqualTo(DecidedBy.MAD);
    }

    // ------------------------------------------------------------------ ml-service decides

    @Test
    void anomalousScoreBecomesAnMlFindingWithEvidence() {
        replies.add(new Reply(200, score(true, true, true), 0));
        var e = model().evaluate(input(HEALTHY, NOW, Set.of()));

        Finding f = finding(e, AlertKind.POWER_SHIFT).orElseThrow();
        assertThat(f.decidedBy()).isEqualTo(DecidedBy.ML);
        assertThat(f.evidence()).containsEntry("baselineWatts", 115.0).containsEntry("currentWatts", 131.2)
                .containsEntry("changePct", 14.1).containsEntry("model", "seasonal-robust-z/1")
                .containsEntry("mlScore", 1.4);
        assertThat(f.message()).contains("14% higher");
        assertThat(e.evaluated()).contains(AlertKind.POWER_SHIFT, AlertKind.DUTY_CYCLE_DRIFT, AlertKind.NO_DATA);
        assertThat(finding(e, AlertKind.DUTY_CYCLE_DRIFT)).isEmpty();
        assertThat(requests).hasSize(1).first().asString()
                .startsWith("/v1/models/" + APPLIANCE + "/score")
                .contains("\"window_start\":\"" + START + "\"");
    }

    @Test
    void normalScoreOverridesTheBuiltInFindingForTheKindsMlJudged() {
        replies.add(new Reply(200, score(true, false, true), 0));
        var e = model().evaluate(input(SHIFTED, NOW, Set.of()));
        assertThat(finding(e, AlertKind.POWER_SHIFT)).isEmpty();
        assertThat(e.evaluated()).contains(AlertKind.POWER_SHIFT);
    }

    @Test
    void kindMlCouldNotJudgeKeepsTheBuiltInDecision() {
        replies.add(new Reply(200, score(false, false, true), 0));
        var e = model().evaluate(input(SHIFTED, NOW, Set.of()));
        assertThat(finding(e, AlertKind.POWER_SHIFT)).get().extracting(Finding::decidedBy).isEqualTo(DecidedBy.MAD);
    }

    @Test
    void liveAlertsAskForHysteresis() {
        replies.add(new Reply(200, score(true, true, true), 0));
        model().evaluate(input(HEALTHY, NOW, Set.of(AlertKind.POWER_SHIFT, AlertKind.DUTY_CYCLE_DRIFT)));
        assertThat(requests.get(0)).contains("\"live_features\":[\"cycle_minutes\",\"duty\",\"on_power\"]");
    }

    // ------------------------------------------------------------------ fallback

    @Test
    void serverErrorFallsBackToTheBuiltInDetector() {
        replies.add(new Reply(500, "{\"detail\":\"boom\"}", 0));
        var e = model().evaluate(input(SHIFTED, NOW, Set.of()));
        assertThat(finding(e, AlertKind.POWER_SHIFT)).get().extracting(Finding::decidedBy).isEqualTo(DecidedBy.MAD);
        assertThat(meters.counter("homepulse.ml.evaluations", "outcome", "error").count()).isEqualTo(1);
    }

    @Test
    void timeoutFallsBackToTheBuiltInDetector() {
        replies.add(new Reply(200, score(true, false, true), 2_000));    // slower than the 500 ms timeout
        long t0 = System.nanoTime();
        var e = model().evaluate(input(SHIFTED, NOW, Set.of()));
        assertThat(Duration.ofNanos(System.nanoTime() - t0)).isLessThan(Duration.ofMillis(1_800));
        assertThat(finding(e, AlertKind.POWER_SHIFT)).get().extracting(Finding::decidedBy).isEqualTo(DecidedBy.MAD);
    }

    @Test
    void refusedConnectionFallsBackToTheBuiltInDetector() throws IOException {
        int closedPort;
        try (ServerSocket s = new ServerSocket(0)) {
            closedPort = s.getLocalPort();
        }
        var e = model("http://127.0.0.1:" + closedPort).evaluate(input(SHIFTED, NOW, Set.of()));
        assertThat(finding(e, AlertKind.POWER_SHIFT)).get().extracting(Finding::decidedBy).isEqualTo(DecidedBy.MAD);
    }

    @Test
    void unreadableAnswerFallsBackToTheBuiltInDetector() {
        replies.add(new Reply(200, "{\"status\":\"something else\"}", 0));
        var e = model().evaluate(input(SHIFTED, NOW, Set.of()));
        assertThat(finding(e, AlertKind.POWER_SHIFT)).get().extracting(Finding::decidedBy).isEqualTo(DecidedBy.MAD);
    }

    // ------------------------------------------------------------------ untrained / stale

    @Test
    void untrainedModelIsTrainedFromTheLearningWindowAndScoredAgain() {
        replies.add(new Reply(404, "{\"status\":\"untrained\"}", 0));
        replies.add(new Reply(200, "{\"model_version\":\"seasonal-robust-z/1\"}", 0));
        replies.add(new Reply(200, score(true, true, true), 0));
        var e = model().evaluate(input(HEALTHY, NOW, Set.of()));

        assertThat(trainCalls.get()).isEqualTo(1);
        assertThat(requests.get(1)).startsWith("/v1/models/" + APPLIANCE + "/train");
        assertThat(finding(e, AlertKind.POWER_SHIFT)).get().extracting(Finding::decidedBy).isEqualTo(DecidedBy.ML);
    }

    @Test
    void staleModelIsRetrained() {
        replies.add(new Reply(409, "{\"status\":\"stale\"}", 0));
        replies.add(new Reply(200, "{}", 0));
        replies.add(new Reply(200, score(true, false, true), 0));
        var e = model().evaluate(input(SHIFTED, NOW, Set.of()));
        assertThat(trainCalls.get()).isEqualTo(1);
        assertThat(finding(e, AlertKind.POWER_SHIFT)).isEmpty();      // ml-service decided: normal
    }

    @Test
    void failedTrainingFallsBackAndIsNotRetriedUntilTheBackoffPassed() {
        MlAnomalyModel m = model();
        replies.add(new Reply(404, "{\"status\":\"untrained\"}", 0));
        replies.add(new Reply(422, "{\"status\":\"insufficient_data\"}", 0));
        var first = m.evaluate(input(SHIFTED, NOW, Set.of()));
        assertThat(finding(first, AlertKind.POWER_SHIFT)).get().extracting(Finding::decidedBy).isEqualTo(DecidedBy.MAD);

        replies.add(new Reply(404, "{\"status\":\"untrained\"}", 0));
        var second = m.evaluate(input(SHIFTED, NOW.plus(Duration.ofMinutes(5)), Set.of()));
        assertThat(finding(second, AlertKind.POWER_SHIFT)).get().extracting(Finding::decidedBy).isEqualTo(DecidedBy.MAD);
        assertThat(trainCalls.get()).isEqualTo(1);

        replies.add(new Reply(404, "{\"status\":\"untrained\"}", 0));
        replies.add(new Reply(200, "{}", 0));
        replies.add(new Reply(200, score(true, true, true), 0));
        var later = m.evaluate(input(SHIFTED, NOW.plus(Duration.ofMinutes(11)), Set.of()));
        assertThat(trainCalls.get()).isEqualTo(2);
        assertThat(finding(later, AlertKind.POWER_SHIFT)).get().extracting(Finding::decidedBy).isEqualTo(DecidedBy.ML);
    }

    // ------------------------------------------------------------------ no call at all

    @Test
    void noCallWhileLearningOrWhenTheSensorIsSilent() {
        var learning = new AnomalyModel.Input(APPLIANCE, ApplianceType.FRIDGE, FRIDGE, null, List.of(), START, NOW,
                Set.of(), List::of);
        assertThat(model().evaluate(learning).findings()).extracting(Finding::kind).containsOnly(AlertKind.NO_DATA);

        var silent = input(HEALTHY, NOW.plus(Duration.ofDays(1)).plus(Duration.ofHours(3)), Set.of());
        var e = model().evaluate(new AnomalyModel.Input(APPLIANCE, ApplianceType.FRIDGE, FRIDGE, BASELINE,
                silent.samples(), silent.lastSeen(), NOW.plus(Duration.ofDays(3)), Set.of(), silent.trainingSamples()));
        assertThat(e.findings()).extracting(Finding::kind).containsExactly(AlertKind.NO_DATA);
        assertThat(requests).isEmpty();
    }
}
