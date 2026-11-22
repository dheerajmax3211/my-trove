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
import java.util.HexFormat;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** Developer apps (design 5.2 apps:manage; W4 item 1): created once with a secret shown once, stored hashed, rotatable, revocable. */
class DeveloperAppsTest extends AbstractPlatformTest {

    static final String DEVELOPER_UID = "11111111-1111-7111-8111-111111111111";
    static final String OTHER_UID = "22222222-2222-7222-8222-222222222222";

    /** The digest the service must store: SHA-256 of the secret, lower-case hex. */
    static String sha256Hex(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    }

    @BeforeEach
    void emptyApps() {
        DeveloperTables.wipe(dsl);
    }

    static RequestPostProcessor developer(String uid) {
        return jwt().jwt(j -> j.subject("firebase-" + uid).claim("uid", uid).claim("plan", "FREE")
                        .claim("roles", List.of("MEMBER", "DEVELOPER")))
                .authorities(List.of("products:use", "usage:read:self", "connections:manage", "apps:manage", "keys:manage",
                        "webhooks:manage", "sandbox:use", "logs:read:own", "workspaces:manage").stream()
                        .map(a -> (GrantedAuthority) new SimpleGrantedAuthority(a)).toList());
    }

    static RequestPostProcessor member(String uid) {
        return jwt().jwt(j -> j.subject("firebase-" + uid).claim("uid", uid).claim("plan", "FREE").claim("roles", List.of("MEMBER")))
                .authorities(List.of("products:use", "usage:read:self", "connections:manage").stream()
                        .map(a -> (GrantedAuthority) new SimpleGrantedAuthority(a)).toList());
    }

    private String createApp(String uid, String name) throws Exception {
        MvcResult r = mvc.perform(post("/v1/developer/apps").with(developer(uid)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"description\":\"demo\",\"redirectUris\":[\"https://app.example.test/cb\"]}"))
                .andExpect(status().isCreated()).andReturn();
        return JsonPath.read(r.getResponse().getContentAsString(), "$.id");
    }

    @Test
    void createReturnsTheSecretOnceAndStoresOnlyItsHash() throws Exception {
        MvcResult r = mvc.perform(post("/v1/developer/apps").with(developer(DEVELOPER_UID)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Stride Lab\",\"description\":\"demo\",\"redirectUris\":[\"https://app.example.test/cb\"]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.clientId").isString())
                .andExpect(jsonPath("$.clientSecret").isString())
                .andExpect(jsonPath("$.redirectUris[0]").value("https://app.example.test/cb"))
                .andReturn();
        String body = r.getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");
        String secret = JsonPath.read(body, "$.clientSecret");

        String stored = dsl.fetchValue("select client_secret_hash from platform.developer_apps where id = cast(? as uuid)", id).toString();
        assertThat(stored).isNotEqualTo(secret).doesNotContain(secret).hasSize(64);
        assertThat(stored).isEqualTo(sha256Hex(secret));

        mvc.perform(get("/v1/developer/apps").with(developer(DEVELOPER_UID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].clientSecret").doesNotExist());
        mvc.perform(get("/v1/developer/apps/" + id).with(developer(DEVELOPER_UID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clientSecret").doesNotExist());
    }

    @Test
    void membersCannotManageApps() throws Exception {
        mvc.perform(post("/v1/developer/apps").with(member(DEVELOPER_UID)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Nope\",\"redirectUris\":[]}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/v1/developer/apps").with(member(DEVELOPER_UID))).andExpect(status().isForbidden());
    }

    @Test
    void developersSeeOnlyTheirOwnApps() throws Exception {
        String id = createApp(DEVELOPER_UID, "Mine");
        mvc.perform(get("/v1/developer/apps/" + id).with(developer(OTHER_UID))).andExpect(status().isNotFound());
        mvc.perform(get("/v1/developer/apps").with(developer(OTHER_UID))).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(post("/v1/developer/apps/" + id + "/client-secret/rotate").with(developer(OTHER_UID)))
                .andExpect(status().isNotFound());
    }

    @Test
    void rotatingReturnsANewSecretAndTheOldHashNoLongerMatches() throws Exception {
        String id = createApp(DEVELOPER_UID, "Rotate");
        String before = dsl.fetchValue("select client_secret_hash from platform.developer_apps where id = cast(? as uuid)", id).toString();

        MvcResult r = mvc.perform(post("/v1/developer/apps/" + id + "/client-secret/rotate").with(developer(DEVELOPER_UID)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.clientSecret").isString()).andReturn();
        String newSecret = JsonPath.read(r.getResponse().getContentAsString(), "$.clientSecret");

        String after = dsl.fetchValue("select client_secret_hash from platform.developer_apps where id = cast(? as uuid)", id).toString();
        assertThat(after).isNotEqualTo(before).isEqualTo(sha256Hex(newSecret));
    }

    @Test
    void revokingTheSecretClearsTheHashSoNothingCanMatchIt() throws Exception {
        String id = createApp(DEVELOPER_UID, "Revoke secret");
        mvc.perform(post("/v1/developer/apps/" + id + "/client-secret/revoke").with(developer(DEVELOPER_UID)))
                .andExpect(status().isNoContent());
        Object hash = dsl.fetchValue("select client_secret_hash from platform.developer_apps where id = cast(? as uuid)", id);
        assertThat(hash).isNull();
    }

    @Test
    void deletingAnAppRevokesItAndRefusesFurtherSecretChanges() throws Exception {
        String id = createApp(DEVELOPER_UID, "Delete me");
        mvc.perform(delete("/v1/developer/apps/" + id).with(developer(DEVELOPER_UID))).andExpect(status().isNoContent());
        mvc.perform(get("/v1/developer/apps/" + id).with(developer(DEVELOPER_UID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revokedAt").isNotEmpty());
        mvc.perform(post("/v1/developer/apps/" + id + "/client-secret/rotate").with(developer(DEVELOPER_UID)))
                .andExpect(status().isConflict());
    }

    @Test
    void rejectsBlankNamesAndInsecureRedirectUris() throws Exception {
        mvc.perform(post("/v1/developer/apps").with(developer(DEVELOPER_UID)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"   \",\"redirectUris\":[]}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/v1/developer/apps").with(developer(DEVELOPER_UID)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Plain http\",\"redirectUris\":[\"http://evil.example.test/cb\"]}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/v1/developer/apps").with(developer(DEVELOPER_UID)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Local dev\",\"redirectUris\":[\"http://localhost:5173/cb\"]}"))
                .andExpect(status().isCreated());
    }
}
