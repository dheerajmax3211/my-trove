package com.personalplatform.shared;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Real Postgres (Testcontainers), real Flyway migrations incl. the audit trigger, stub JWT decoder, controllable clock.
 * All subclasses share one Spring context (and one container). audit_events is never cleaned: it is append-only.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, StubJwtConfig.class, TestBeans.class})
@TestPropertySource(properties = {
        "app.scheduler.enabled=false",
        "app.notifications.sender=test",
        "app.files.local-root=target/test-blobs",
        "app.files.token-secret=test-secret-test-secret-test-secret-0123456789",
})
abstract class AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired DSLContext dsl;
    @Autowired MutableClock clock;
    @Autowired TestBeans.RecordingSender sender;
    @Autowired PlatformTransactionManager txManager;

    @BeforeEach
    void cleanDatabase() {
        clock.set(TestBeans.T0);
        sender.reset();
        dsl.execute("delete from shared.notifications"); // outbox and inbox; email-only rows too
        dsl.execute("delete from shared.user_contacts");
        dsl.execute("delete from shared.reminders");
        dsl.execute("delete from shared.files");
        dsl.execute("delete from shared.households"); // cascades members + invites
    }

    static String uid(String name) {
        return name + "-" + UUID.randomUUID();
    }

    static String bearer(String uid) {
        return "Bearer " + Base64.getUrlEncoder().withoutPadding().encodeToString(uid.getBytes(StandardCharsets.UTF_8));
    }

    ResultActions send(String uid, AbstractMockHttpServletRequestBuilder<?> req) throws Exception {
        return mvc.perform(req.header("Authorization", bearer(uid)));
    }

    ResultActions getAs(String uid, String path) throws Exception {
        return send(uid, get(path));
    }

    ResultActions getWithToken(String authorization, String path) throws Exception {
        return mvc.perform(get(path).header("Authorization", authorization));
    }

    ResultActions postAs(String uid, String path, String json) throws Exception {
        return send(uid, post(path).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    ResultActions putAs(String uid, String path, String json) throws Exception {
        return send(uid, put(path).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    ResultActions deleteAs(String uid, String path) throws Exception {
        return send(uid, delete(path));
    }

    static <T> T read(ResultActions r, String jsonPath) throws Exception {
        return JsonPath.read(r.andReturn().getResponse().getContentAsString(), jsonPath);
    }

    // ---- fixtures ------------------------------------------------------------------------------------------

    UUID createHousehold(String uid, String name) throws Exception {
        return UUID.fromString(read(postAs(uid, "/v1/households", "{\"name\":\"" + name + "\"}"), "$.id"));
    }

    String createInvite(String ownerUid, UUID household) throws Exception {
        return read(postAs(ownerUid, "/v1/households/" + household + "/invites", "{}"), "$.code");
    }

    void join(String uid, UUID household, String ownerUid) throws Exception {
        String code = createInvite(ownerUid, household);
        postAs(uid, "/v1/invites/accept", "{\"code\":\"" + code + "\"}")
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
    }
}
