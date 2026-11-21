package com.personalplatform.consent.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.UUID;
import org.jooq.DSLContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Base for every Spring test: all subclasses share ONE application context (and one Postgres container) because the
 * configuration is identical. Tests isolate themselves with fresh random owners, never by cleaning tables (the audit
 * log is append-only by design).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestSupportConfig.class)
@TestPropertySource(
        properties = {
            "app.firebase.project-id=test-project",
            // base64 of 32 bytes: a TEST value only
            "app.consent.key-encryption-key=dGVzdC1vbmx5LWtleS1lbmNyeXB0aW9uLWtleS0zMmI=",
            "app.consent.auto-rotate-keys=false",
            "logging.level.com.personalplatform=DEBUG",
            "logging.level.org.springframework.security=DEBUG"
        })
public abstract class IntegrationTest {

    @Autowired protected MockMvc mvc;
    @Autowired protected MutableClock clock;
    @Autowired protected DSLContext dsl;

    /** A ready-to-use consent: owner, client, grant and an access token. */
    public record Access(String owner, Registered client, String requestId, String grantId, String accessToken) {}

    public record Registered(String clientId, String clientSecret) {}

    protected static String newOwner() {
        return "owner-" + UUID.randomUUID();
    }

    protected static String ownerBearer(String uid) {
        return "Bearer " + Base64.getUrlEncoder().withoutPadding().encodeToString(uid.getBytes(StandardCharsets.UTF_8));
    }

    protected static String json(String s) {
        return s.replace('\'', '"');
    }

    protected static <T> T read(ResultActions r, String path) throws Exception {
        return JsonPath.read(r.andReturn().getResponse().getContentAsString(), path);
    }

    // ---- owner API helpers ----

    protected MockHttpServletRequestBuilder asOwner(MockHttpServletRequestBuilder b, String owner) {
        return b.header("Authorization", ownerBearer(owner)).contentType(MediaType.APPLICATION_JSON);
    }

    protected void putAttribute(String owner, String key, String valueJson, String sensitivity) throws Exception {
        mvc.perform(asOwner(post("/v1/owner/vault/attributes"), owner)
                        .content(json("{'keyPath':'" + key + "','value':" + valueJson + ",'sensitivity':'" + sensitivity + "'}")))
                .andExpect(status().isCreated());
    }

    protected Registered registerClient(String owner, String... allowedScopes) throws Exception {
        String scopes = String.join("','", allowedScopes);
        ResultActions r = mvc.perform(asOwner(post("/v1/owner/clients"), owner)
                        .content(json("{'name':'Shoe Shop','contactEmail':'dev@shoes.example','allowedScopes':['" + scopes + "']}")))
                .andExpect(status().isCreated());
        return new Registered(read(r, "$.client.clientId"), read(r, "$.clientSecret"));
    }

    // ---- client API helpers ----

    protected ResultActions tokenRequest(String clientId, String secret) throws Exception {
        String basic = Base64.getEncoder().encodeToString((clientId + ":" + secret).getBytes(StandardCharsets.UTF_8));
        return mvc.perform(post("/v1/oauth/token")
                .header("Authorization", "Basic " + basic)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .content("grant_type=client_credentials"));
    }

    protected String clientToken(Registered c) throws Exception {
        return read(tokenRequest(c.clientId(), c.clientSecret()).andExpect(status().isOk()), "$.access_token");
    }

    protected static String bearer(String token) {
        return "Bearer " + token;
    }

    protected String createRequest(String clientToken, String body) throws Exception {
        return read(mvc.perform(post("/v1/gateway/requests")
                        .header("Authorization", bearer(clientToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(body)))
                .andExpect(status().isCreated()), "$.id");
    }

    protected String approve(String owner, String requestId, String body) throws Exception {
        return read(mvc.perform(asOwner(post("/v1/owner/requests/" + requestId + "/approve"), owner).content(json(body)))
                .andExpect(status().isOk()), "$.id");
    }

    protected String exchange(String clientToken, String grantId) throws Exception {
        return read(mvc.perform(post("/v1/gateway/grants/" + grantId + "/token").header("Authorization", bearer(clientToken)))
                .andExpect(status().isOk()), "$.access_token");
    }

    protected ResultActions readData(String accessToken, String query) throws Exception {
        return mvc.perform(get("/v1/gateway/data" + (query == null ? "" : "?" + query))
                .header("Authorization", bearer(accessToken)));
    }

    /** Whole happy path with default conditions (1 hour, unlimited reads). */
    protected Access grantAccess(String owner, String... scopes) throws Exception {
        return grantAccess(owner, 3600, null, null, scopes);
    }

    protected Access grantAccess(String owner, long durationSeconds, Integer maxReads, String approveBody, String... scopes)
            throws Exception {
        Registered client = registerClient(owner, scopes);
        String ct = clientToken(client);
        String list = "'" + String.join("','", scopes) + "'";
        String requestId = createRequest(ct, "{'scopes':[" + list + "],'purpose':'sizing','durationSeconds':" + durationSeconds
                + (maxReads == null ? "" : ",'maxReads':" + maxReads) + "}");
        String grantId = approve(owner, requestId, approveBody == null ? "{}" : approveBody);
        return new Access(owner, client, requestId, grantId, exchange(ct, grantId));
    }

    protected ResultActions ownerGet(String owner, String path) throws Exception {
        return mvc.perform(get(path).header("Authorization", ownerBearer(owner)));
    }

    protected ResultActions ownerPost(String owner, String path, String body) throws Exception {
        return mvc.perform(asOwner(post(path), owner).content(body == null ? "" : json(body)));
    }

    protected ResultActions ownerPut(String owner, String path, String body) throws Exception {
        return mvc.perform(asOwner(put(path), owner).content(json(body)));
    }

    protected ResultActions ownerDelete(String owner, String path) throws Exception {
        return mvc.perform(delete(path).header("Authorization", ownerBearer(owner)));
    }
}
