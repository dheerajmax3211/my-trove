package com.personalplatform.homepulse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * The whole path with ML_SERVICE_URL set: simulator -> evaluation -> stubbed ml-service -> alert row -> API, and the
 * fallback to the built-in detector when ml-service fails. Own Spring context (own TimescaleDB container).
 */
class MlServiceIntegrationTest extends AbstractIntegrationTest {

    static final HttpServer STUB;
    static final List<String> PATHS = new CopyOnWriteArrayList<>();
    static final AtomicInteger SCORE_STATUS = new AtomicInteger(200);
    static volatile boolean trained;

    static final String ANOMALOUS = """
            {"status":"ok","evaluated":true,"anomalous":true,"model_version":"seasonal-robust-z/1",
             "features":[{"name":"on_power","kind":"POWER_SHIFT","evaluated":true,"anomalous":true,"statistic":9.1,
              "threshold":4.0,"score":2.3,"direction":1,"observed":168.0,"expected":130.0,"change_pct":29.2}]}
            """;

    static {
        try {
            STUB = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        STUB.createContext("/", ex -> {
            ex.getRequestBody().readAllBytes();
            String path = ex.getRequestURI().getPath();
            PATHS.add(path);
            int status;
            String body;
            if (path.endsWith("/train")) {
                trained = true;
                status = 200;
                body = "{}";
            } else if (!trained) {
                status = 404;
                body = "{\"status\":\"untrained\"}";
            } else {
                status = SCORE_STATUS.get();
                body = status == 200 ? ANOMALOUS : "{}";
            }
            byte[] out = body.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(status, out.length);
            ex.getResponseBody().write(out);
            ex.close();
        });
        STUB.start();
    }

    @DynamicPropertySource
    static void mlService(DynamicPropertyRegistry registry) {
        registry.add("app.ml.url", () -> "http://127.0.0.1:" + STUB.getAddress().getPort());
    }

    @AfterAll
    static void stopStub() {
        STUB.stop(0);
    }

    @BeforeEach
    void resetStub() {
        PATHS.clear();
        SCORE_STATUS.set(200);
        trained = false;
    }

    private void simulateAnomaly(UUID appliance) throws Exception {
        mvc.perform(post("/v1/appliances/" + appliance + "/simulation").header("Authorization", bearer(ALICE))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"days\":7,\"scenario\":\"ANOMALY\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.alertOpened").value(true));
    }

    @Test
    void untrainedModelIsTrainedThenDecidesAndTheAlertSaysSo() throws Exception {
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        simulateAnomaly(fridge);

        assertThat(PATHS).containsExactly("/v1/models/" + fridge + "/score", "/v1/models/" + fridge + "/train",
                "/v1/models/" + fridge + "/score");
        getAs(ALICE, "/v1/alerts?applianceId=" + fridge).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].kind", containsInAnyOrder("POWER_SHIFT", "STUCK_ON")))
                .andExpect(jsonPath("$[?(@.kind == 'POWER_SHIFT')].decidedBy").value("ML"))
                .andExpect(jsonPath("$[?(@.kind == 'POWER_SHIFT')].evidence.model").value("seasonal-robust-z/1"))
                .andExpect(jsonPath("$[?(@.kind == 'STUCK_ON')].decidedBy").value("MAD"));
        assertThat(dsl.fetchValue("select decided_by from home_pulse.alerts where kind = 'POWER_SHIFT'")).isEqualTo("ML");
    }

    @Test
    void serverErrorLeavesTheDecisionToTheBuiltInDetector() throws Exception {
        trained = true;
        SCORE_STATUS.set(500);
        UUID fridge = createAppliance(ALICE, "FRIDGE", "");
        simulateAnomaly(fridge);

        getAs(ALICE, "/v1/alerts?applianceId=" + fridge).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].kind").value("STUCK_ON"))
                .andExpect(jsonPath("$[0].decidedBy").value("MAD"));
    }
}
