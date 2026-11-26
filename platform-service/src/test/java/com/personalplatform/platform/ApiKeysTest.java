package com.personalplatform.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * API keys (W4 item 2): hashed, prefixed, scoped, expiring, revocable, counted against the plan, and verified by the
 * internal endpoint that auth calls when a gateway caller presents {@code pk_...}.
 */
class ApiKeysTest extends AbstractPlatformTest {

    static final String OWNER = DeveloperAppsTest.DEVELOPER_UID;
    static final String OTHER = DeveloperAppsTest.OTHER_UID;
    static final String INTERNAL = "test-internal-key";
    static final List<String> DEVELOPER_AUTHORITIES = List.of("products:use", "usage:read:self", "connections:manage",
            "apps:manage", "keys:manage", "webhooks:manage", "sandbox:use", "logs:read:own", "workspaces:manage");

    @BeforeEach
    void empty() {
        DeveloperTables.wipe(dsl);
    }

    static RequestPostProcessor developerOn(String uid, String plan) {
        return jwt().jwt(j -> j.subject("firebase-" + uid).claim("uid", uid).claim("plan", plan)
                        .claim("roles", List.of("MEMBER", "DEVELOPER")))
                .authorities(DEVELOPER_AUTHORITIES.stream().map(a -> (GrantedAuthority) new SimpleGrantedAuthority(a)).toList());
    }

    private String createApp(String uid) throws Exception {
        MvcResult r = mvc.perform(post("/v1/developer/apps").with(developerOn(uid, "FREE")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Keys app\",\"redirectUris\":[]}"))
                .andExpect(status().isCreated()).andReturn();
        return JsonPath.read(r.getResponse().getContentAsString(), "$.id");
    }

    private MvcResult issue(String uid, String plan, String appId, String scopesJson, String expiresAtOrNull) throws Exception {
        String expires = expiresAtOrNull == null ? "" : ",\"expiresAt\":\"" + expiresAtOrNull + "\"";
        return mvc.perform(post("/v1/developer/apps/" + appId + "/keys").with(developerOn(uid, plan))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"CI key\",\"scopes\":" + scopesJson + expires + "}"))
                .andReturn();
    }

    private String issueKey(String appId, String scopesJson) throws Exception {
        MvcResult r = issue(OWNER, "FREE", appId, scopesJson, null);
        assertThat(r.getResponse().getStatus()).isEqualTo(201);
        return JsonPath.read(r.getResponse().getContentAsString(), "$.key");
    }

    private MvcResult verify(String key) throws Exception {
        return mvc.perform(post("/internal/v1/api-keys/verify").header("X-Internal-Key", INTERNAL)
                .contentType(MediaType.APPLICATION_JSON).content("{\"key\":\"" + key + "\"}")).andReturn();
    }

    static String sha256Hex(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void createReturnsTheKeyOnceAndStoresOnlyItsHash() throws Exception {
        String appId = createApp(OWNER);
        MvcResult r = issue(OWNER, "FREE", appId, "[\"usage:read\"]", null);
        assertThat(r.getResponse().getStatus()).isEqualTo(201);
        String body = r.getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");
        String key = JsonPath.read(body, "$.key");
        assertThat(key).startsWith("pk_").hasSizeGreaterThan(40);
        assertThat(JsonPath.<String>read(body, "$.keyPrefix")).isEqualTo(key.substring(0, 11));
        assertThat(JsonPath.<List<String>>read(body, "$.scopes")).containsExactly("usage:read");

        Object hash = dsl.fetchValue("select key_hash from platform.api_keys where id = cast(? as uuid)", id);
        assertThat(hash).isEqualTo(sha256Hex(key));
        assertThat(hash.toString()).doesNotContain(key);

        mvc.perform(get("/v1/developer/apps/" + appId + "/keys").with(developerOn(OWNER, "FREE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].key").doesNotExist())
                .andExpect(jsonPath("$[0].keyHash").doesNotExist());
    }

    @Test
    void scopesMustBeInTheCatalogueAndNonEmpty() throws Exception {
        String appId = createApp(OWNER);
        assertThat(issue(OWNER, "FREE", appId, "[\"admin:everything\"]", null).getResponse().getStatus()).isEqualTo(400);
        assertThat(issue(OWNER, "FREE", appId, "[]", null).getResponse().getStatus()).isEqualTo(400);
    }

    @Test
    void membersCannotIssueKeys() throws Exception {
        String appId = createApp(OWNER);
        mvc.perform(post("/v1/developer/apps/" + appId + "/keys").with(DeveloperAppsTest.member(OWNER))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"x\",\"scopes\":[\"usage:read\"]}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void keysAreOwnerScoped() throws Exception {
        String appId = createApp(OWNER);
        String key = issueKey(appId, "[\"usage:read\"]");
        String keyId = JsonPath.read(verifyBody(key), "$.keyId");
        mvc.perform(get("/v1/developer/apps/" + appId + "/keys").with(developerOn(OTHER, "FREE"))).andExpect(status().isNotFound());
        mvc.perform(post("/v1/developer/apps/" + appId + "/keys").with(developerOn(OTHER, "FREE"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"x\",\"scopes\":[\"usage:read\"]}"))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/v1/developer/keys/" + keyId).with(developerOn(OTHER, "FREE"))).andExpect(status().isNotFound());
    }

    @Test
    void verifyAcceptsAValidKeyAndMapsScopesToPermissions() throws Exception {
        String appId = createApp(OWNER);
        String key = issueKey(appId, "[\"usage:read\"]");
        verify(key);
        mvc.perform(post("/internal/v1/api-keys/verify").header("X-Internal-Key", INTERNAL)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"key\":\"" + key + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.appId").value(appId))
                .andExpect(jsonPath("$.ownerUid").value(OWNER))
                .andExpect(jsonPath("$.scopes[0]").value("usage:read"))
                .andExpect(jsonPath("$.permissions[0]").value("usage:read:self"));
    }

    @Test
    void verifyRefusesWrongSecretUnknownPrefixAndMissingInternalKey() throws Exception {
        String appId = createApp(OWNER);
        String key = issueKey(appId, "[\"usage:read\"]");
        String forged = key.substring(0, 11) + "x".repeat(key.length() - 11);
        assertThat(verify(forged).getResponse().getStatus()).isEqualTo(401);
        assertThat(verify("pk_zzzzzzzz_notakey").getResponse().getStatus()).isEqualTo(401);
        mvc.perform(post("/internal/v1/api-keys/verify").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"key\":\"" + key + "\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void revokedKeysStopVerifying() throws Exception {
        String appId = createApp(OWNER);
        String key = issueKey(appId, "[\"usage:read\"]");
        String keyId = JsonPath.read(verifyBody(key), "$.keyId");
        mvc.perform(delete("/v1/developer/keys/" + keyId).with(developerOn(OWNER, "FREE"))).andExpect(status().isNoContent());
        assertThat(verify(key).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void expiredKeysStopVerifying() throws Exception {
        String appId = createApp(OWNER);
        MvcResult r = issue(OWNER, "FREE", appId, "[\"usage:read\"]", "2031-03-16T00:00:00Z");
        String key = JsonPath.read(r.getResponse().getContentAsString(), "$.key");
        assertThat(verify(key).getResponse().getStatus()).isEqualTo(200);
        clock.set(Instant.parse("2031-03-17T00:00:00Z"));
        assertThat(verify(key).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void keysOfRevokedAppsStopVerifying() throws Exception {
        String appId = createApp(OWNER);
        String key = issueKey(appId, "[\"usage:read\"]");
        mvc.perform(delete("/v1/developer/apps/" + appId).with(developerOn(OWNER, "FREE"))).andExpect(status().isNoContent());
        assertThat(verify(key).getResponse().getStatus()).isEqualTo(401);
        assertThat(issue(OWNER, "FREE", appId, "[\"usage:read\"]", null).getResponse().getStatus()).isEqualTo(409);
    }

    @Test
    void verifyRecordsLastUsed() throws Exception {
        String appId = createApp(OWNER);
        String key = issueKey(appId, "[\"usage:read\"]");
        String keyId = JsonPath.read(verifyBody(key), "$.keyId");
        Object before = dsl.fetchValue("select last_used_at from platform.api_keys where id = cast(? as uuid)", keyId);
        assertThat(before).isNotNull();
        assertThat(((java.time.OffsetDateTime) before).toInstant()).isEqualTo(clock.instant());
    }

    @Test
    void freePlanAllowsThreeKeysAndRevokingFreesASlot() throws Exception {
        String appId = createApp(OWNER);
        String first = null;
        for (int i = 0; i < 3; i++) {
            MvcResult r = issue(OWNER, "FREE", appId, "[\"usage:read\"]", null);
            assertThat(r.getResponse().getStatus()).isEqualTo(201);
            if (first == null) first = JsonPath.read(r.getResponse().getContentAsString(), "$.id");
        }
        assertThat(issue(OWNER, "FREE", appId, "[\"usage:read\"]", null).getResponse().getStatus()).isEqualTo(409);
        mvc.perform(delete("/v1/developer/keys/" + first).with(developerOn(OWNER, "FREE"))).andExpect(status().isNoContent());
        assertThat(issue(OWNER, "FREE", appId, "[\"usage:read\"]", null).getResponse().getStatus()).isEqualTo(201);
    }

    @Test
    void theLimitFollowsThePlanInTheToken() throws Exception {
        String appId = createApp(OWNER);
        for (int i = 0; i < 4; i++) {
            assertThat(issue(OWNER, "PRO", appId, "[\"usage:read\"]", null).getResponse().getStatus()).isEqualTo(201);
        }
    }

    @Test
    void catalogueListsTheScopes() throws Exception {
        mvc.perform(get("/v1/developer/scopes").with(developerOn(OWNER, "FREE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("usage:read"))
                .andExpect(jsonPath("$[0].permissions[0]").value("usage:read:self"))
                .andExpect(jsonPath("$[1].name").value("mcp:use"))
                .andExpect(jsonPath("$[1].permissions[0]").value("mcp:use"));
    }

    @Test
    void anMcpKeyCarriesMcpUseAndNothingElse() throws Exception {
        String key = issueKey(createApp(OWNER), "[\"mcp:use\"]");
        String body = verifyBody(key);
        assertThat(JsonPath.<List<String>>read(body, "$.permissions")).containsExactly("mcp:use");
    }

    @Test
    void theProductsReadScopeGrantsProductsUseOnly() throws Exception {
        String key = issueKey(createApp(OWNER), "[\"mcp:use\",\"products:read\"]");
        assertThat(JsonPath.<List<String>>read(verifyBody(key), "$.permissions"))
                .containsExactly("mcp:use", "products:use");
        mvc.perform(get("/v1/developer/scopes").with(developerOn(OWNER, "FREE")))
                .andExpect(jsonPath("$[2].name").value("products:read"))
                .andExpect(jsonPath("$[2].permissions.length()").value(1))
                .andExpect(jsonPath("$[2].permissions[0]").value("products:use"));
    }

    private MvcResult keyStatus(String keyId, String internalKey) throws Exception {
        var request = post("/internal/v1/api-keys/status").contentType(MediaType.APPLICATION_JSON)
                .content("{\"keyId\":\"" + keyId + "\"}");
        if (internalKey != null) {
            request.header("X-Internal-Key", internalKey);
        }
        return mvc.perform(request).andReturn();
    }

    @Test
    void statusReportsAnActiveKeyWithItsAppOwnerAndPermissions() throws Exception {
        String appId = createApp(OWNER);
        String key = issueKey(appId, "[\"mcp:use\",\"products:read\"]");
        String keyId = JsonPath.read(verifyBody(key), "$.keyId");
        MvcResult r = keyStatus(keyId, INTERNAL);
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        String body = r.getResponse().getContentAsString();
        assertThat(JsonPath.<String>read(body, "$.state")).isEqualTo("ACTIVE");
        assertThat(JsonPath.<String>read(body, "$.appId")).isEqualTo(appId);
        assertThat(JsonPath.<String>read(body, "$.ownerUid")).isEqualTo(OWNER);
        assertThat(JsonPath.<List<String>>read(body, "$.permissions")).containsExactly("mcp:use", "products:use");
        assertThat(body).doesNotContain(key).doesNotContain(sha256Hex(key));
    }

    @Test
    void statusReportsRevokedExpiredAndDisabledApp() throws Exception {
        String appId = createApp(OWNER);
        String revoked = JsonPath.read(verifyBody(issueKey(appId, "[\"mcp:use\"]")), "$.keyId");
        mvc.perform(delete("/v1/developer/keys/" + revoked).with(developerOn(OWNER, "FREE"))).andExpect(status().isNoContent());
        assertThat(JsonPath.<String>read(keyStatus(revoked, INTERNAL).getResponse().getContentAsString(), "$.state"))
                .isEqualTo("REVOKED");

        MvcResult expiring = issue(OWNER, "FREE", appId, "[\"mcp:use\"]", "2031-03-16T00:00:00Z");
        String expiringId = JsonPath.read(expiring.getResponse().getContentAsString(), "$.id");
        clock.set(Instant.parse("2031-03-17T00:00:00Z"));
        assertThat(JsonPath.<String>read(keyStatus(expiringId, INTERNAL).getResponse().getContentAsString(), "$.state"))
                .isEqualTo("EXPIRED");

        String otherApp = createApp(OWNER);
        String disabled = JsonPath.read(issue(OWNER, "FREE", otherApp, "[\"mcp:use\"]", null).getResponse()
                .getContentAsString(), "$.id");
        mvc.perform(delete("/v1/developer/apps/" + otherApp).with(developerOn(OWNER, "FREE"))).andExpect(status().isNoContent());
        assertThat(JsonPath.<String>read(keyStatus(disabled, INTERNAL).getResponse().getContentAsString(), "$.state"))
                .isEqualTo("APP_DISABLED");
    }

    @Test
    void statusNeedsTheInternalKeyAndAnswers404ForUnknownKeys() throws Exception {
        String keyId = JsonPath.read(verifyBody(issueKey(createApp(OWNER), "[\"mcp:use\"]")), "$.keyId");
        assertThat(keyStatus(keyId, null).getResponse().getStatus()).isEqualTo(401);
        assertThat(keyStatus(keyId, "wrong-key").getResponse().getStatus()).isEqualTo(401);
        assertThat(keyStatus(java.util.UUID.randomUUID().toString(), INTERNAL).getResponse().getStatus()).isEqualTo(404);
    }

    /** The verify response for a key that must be valid. */
    private String verifyBody(String key) throws Exception {
        MvcResult r = verify(key);
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        return r.getResponse().getContentAsString();
    }
}
