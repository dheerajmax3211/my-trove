package com.personalplatform.homepulse;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.UUID;
import org.jooq.DSLContext;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** One shared Spring context (TimescaleDB container, stub Firebase decoder, manual clock) for all API tests. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestSupportConfig.class)
@TestPropertySource(properties = {"app.evaluation.enabled=false", "app.mqtt.enabled=false"})
public abstract class AbstractIntegrationTest {

    public static final String ALICE = "uid-alice";
    public static final String BOB = "uid-bob";

    @Autowired protected MockMvc mvc;
    @Autowired protected DSLContext dsl;
    @Autowired protected MutableClock clock;
    @Autowired protected com.personalplatform.homepulse.reading.ReadingsRepository readingsRepo;

    /** Stores 1-minute samples as raw readings (one reading per minute) for a device, in batches. */
    protected void seed(UUID deviceId, java.util.List<com.personalplatform.homepulse.detect.MinuteSample> samples) {
        for (int i = 0; i < samples.size(); i += 1000) {
            var chunk = samples.subList(i, Math.min(samples.size(), i + 1000)).stream()
                    .map(s -> new com.personalplatform.homepulse.ingest.ReadingInput(s.ts(), s.watts(), null, null)).toList();
            readingsRepo.insertIgnoringDuplicates(deviceId, chunk);
        }
    }

    @BeforeEach
    void resetState() {
        dsl.execute("truncate home_pulse.readings, home_pulse.alerts, home_pulse.baselines, home_pulse.devices, "
                + "home_pulse.appliances cascade");
        clock.set(TestSupportConfig.T0);
    }

    protected static String bearer(String uid) {
        return "Bearer " + Base64.getUrlEncoder().withoutPadding().encodeToString(uid.getBytes(StandardCharsets.UTF_8));
    }

    protected UUID createAppliance(String uid, String type, String extraJsonFields) throws Exception {
        String body = mvc.perform(post("/v1/appliances").header("Authorization", bearer(uid))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Kitchen " + type + "\",\"type\":\"" + type + "\"" + extraJsonFields + "}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(JsonPath.read(body, "$.id"));
    }

    protected record RegisteredDevice(UUID deviceId, String token) {}

    protected RegisteredDevice registerDevice(String uid, UUID applianceId) throws Exception {
        String body = mvc.perform(post("/v1/appliances/" + applianceId + "/devices").header("Authorization", bearer(uid))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"label\":\"plug\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return new RegisteredDevice(UUID.fromString(JsonPath.read(body, "$.device.id")), JsonPath.read(body, "$.ingestionToken"));
    }

    protected org.springframework.test.web.servlet.ResultActions getAs(String uid, String path) throws Exception {
        return mvc.perform(get(path).header("Authorization", bearer(uid)));
    }
}
