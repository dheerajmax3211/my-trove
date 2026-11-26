package com.personalplatform.auth.token;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.personalplatform.auth.AuthIntegrationTest;
import com.personalplatform.auth.TestUsers;
import com.personalplatform.auth.TestUsers.TestUser;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jooq.DSLContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * {@code POST /internal/v1/token/delegate}: an API key's service token (plus the internal key) in, a 5-minute
 * user-shaped token for the key's owner out, holding only (owner's permissions) AND (key's permissions), with
 * {@code act} naming the app. The platform service's key status is mocked; everything else is real.
 */
@AuthIntegrationTest
class DelegationTest {

    static final String INTERNAL = "test-internal-key";
    static final String KEY = "pk_de1e9a7e_" + "d".repeat(43);

    @Autowired MockMvc mvc;
    @Autowired DSLContext dsl;
    @Autowired SigningKeyService signingKeys;

    @MockitoBean ApiKeyVerifier apiKeys;

    record Key(UUID keyId, UUID appId, TestUser owner, String serviceToken) {}

    /** A real service token from the real exchange, for a key with the given permissions. */
    private Key keyFor(TestUser owner, String... permissions) throws Exception {
        UUID keyId = UUID.randomUUID();
        UUID appId = UUID.randomUUID();
        String presented = "pk_" + keyId.toString().substring(0, 8) + "_" + "k".repeat(43);
        when(apiKeys.verify(presented)).thenReturn(new VerifiedApiKey(keyId, appId, owner.id().toString(),
                List.of("mcp:use"), List.of(permissions)));
        active(keyId, appId, owner, permissions);
        String body = mvc.perform(post("/v1/token/exchange").header("Authorization", "Bearer " + presented))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return new Key(keyId, appId, owner, JsonPath.read(body, "$.accessToken"));
    }

    private void active(UUID keyId, UUID appId, TestUser owner, String... permissions) {
        when(apiKeys.status(keyId)).thenReturn(new ApiKeyStatus(keyId, appId, owner.id().toString(),
                ApiKeyStatus.State.ACTIVE, List.of(permissions)));
    }

    private ResultActions delegate(String serviceToken, String internalKey) throws Exception {
        var request = post("/internal/v1/token/delegate").contentType(MediaType.APPLICATION_JSON)
                .content("{\"serviceToken\":\"" + serviceToken + "\"}");
        if (internalKey != null) {
            request.header("X-Internal-Key", internalKey);
        }
        return mvc.perform(request);
    }

    private JWTClaimsSet delegatedClaims(Key key) throws Exception {
        String body = delegate(key.serviceToken(), INTERNAL).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return SignedJWT.parse(JsonPath.<String>read(body, "$.accessToken")).getJWTClaimsSet();
    }

    private TestUser developer(String label) throws Exception {
        TestUser user = TestUsers.newUser(mvc, label);
        TestUsers.giveRole(dsl, user, "DEVELOPER");
        return user;
    }

    @Test
    void aValidServiceTokenGetsAUserShapedTokenForTheOwnerActingAsTheApp() throws Exception {
        TestUser owner = developer("delegate-ok");
        Key key = keyFor(owner, "mcp:use", "products:use");

        String body = delegate(key.serviceToken(), INTERNAL)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.ownerUid").value(owner.id().toString()))
                .andExpect(jsonPath("$.appId").value(key.appId().toString()))
                .andReturn().getResponse().getContentAsString();
        JWTClaimsSet c = SignedJWT.parse(JsonPath.<String>read(body, "$.accessToken")).getJWTClaimsSet();

        assertThat(c.getStringClaim("token_use")).isEqualTo("platform");
        assertThat(c.getSubject()).as("the owner's Firebase uid, like a sign-in token").isEqualTo(owner.uid());
        assertThat(c.getStringClaim("uid")).isEqualTo(owner.id().toString());
        assertThat(c.getAudience()).containsExactly("trove-platform");
        assertThat(c.getIssuer()).isEqualTo("http://auth.test");
        assertThat(c.getStringListClaim("permissions")).containsExactly("mcp:use", "products:use");
        assertThat(c.getStringListClaim("roles")).as("no roles, so no role check can grant more").isEmpty();
        assertThat(c.getJSONObjectClaim("act")).containsEntry("sub", "app:" + key.appId())
                .containsEntry("key_id", key.keyId().toString());
        assertThat(JsonPath.<Integer>read(body, "$.expiresIn")).isBetween(295, 300);
    }

    @Test
    void theDelegatedTokenExpiresAfterFiveMinutes() throws Exception {
        JWTClaimsSet c = delegatedClaims(keyFor(developer("delegate-ttl"), "mcp:use", "products:use"));
        assertThat(c.getExpirationTime().getTime() - c.getIssueTime().getTime()).isEqualTo(300_000L);
    }

    @Test
    void theDelegatedTokenNeverOutlivesTheServiceToken() throws Exception {
        TestUser owner = developer("delegate-short");
        UUID keyId = UUID.randomUUID();
        UUID appId = UUID.randomUUID();
        active(keyId, appId, owner, "products:use");
        Instant soon = Instant.now().plusSeconds(60);
        String token = forge(serviceClaims(keyId, appId, owner.id(), soon).build(), signingKeys.activeKey().kid(),
                signingKeys.activeKey().privateKey());
        String body = delegate(token, INTERNAL).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JWTClaimsSet c = SignedJWT.parse(JsonPath.<String>read(body, "$.accessToken")).getJWTClaimsSet();
        assertThat(c.getExpirationTime().toInstant().getEpochSecond()).isEqualTo(soon.getEpochSecond());
    }

    @Test
    void permissionsAreTheIntersectionOfOwnerAndKey() throws Exception {
        // A MEMBER holds products:use but not mcp:use; the key holds mcp:use, products:use and users:read.
        TestUser member = TestUsers.newUser(mvc, "delegate-member");
        JWTClaimsSet c = delegatedClaims(keyFor(member, "mcp:use", "products:use", "users:read"));
        assertThat(c.getStringListClaim("permissions"))
                .as("never the key's mcp:use the owner lacks, never the owner's usage:read:self the key lacks")
                .containsExactly("products:use");
    }

    @Test
    void aKeyWhosePermissionsShrankSinceItsTokenGetsOnlyTheCurrentOnes() throws Exception {
        TestUser owner = developer("delegate-shrunk");
        Key key = keyFor(owner, "mcp:use", "products:use");
        active(key.keyId(), key.appId(), owner, "mcp:use");
        assertThat(delegatedClaims(key).getStringListClaim("permissions")).containsExactly("mcp:use");
    }

    @Test
    void aSuspendedOwnerGetsNoToken() throws Exception {
        TestUser owner = developer("delegate-suspended");
        Key key = keyFor(owner, "mcp:use", "products:use");
        TestUsers.suspendDirectly(dsl, owner);
        delegate(key.serviceToken(), INTERNAL)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("USER_SUSPENDED"))
                .andExpect(jsonPath("$.accessToken").doesNotExist());
    }

    @Test
    void aRevokedKeyGetsNoToken() throws Exception {
        TestUser owner = developer("delegate-revoked");
        Key key = keyFor(owner, "mcp:use", "products:use");
        when(apiKeys.status(key.keyId())).thenReturn(new ApiKeyStatus(key.keyId(), key.appId(), owner.id().toString(),
                ApiKeyStatus.State.REVOKED, List.of("mcp:use", "products:use")));
        delegate(key.serviceToken(), INTERNAL)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("API_KEY_REVOKED"));
    }

    @Test
    void aKeyThePlatformNoLongerKnowsGetsNoToken() throws Exception {
        Key key = keyFor(developer("delegate-gone"), "mcp:use", "products:use");
        when(apiKeys.status(key.keyId())).thenThrow(new InvalidApiKeyException());
        delegate(key.serviceToken(), INTERNAL)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("API_KEY_REVOKED"));
    }

    @Test
    void anExpiredKeyGetsNoToken() throws Exception {
        TestUser owner = developer("delegate-expired-key");
        Key key = keyFor(owner, "mcp:use", "products:use");
        when(apiKeys.status(key.keyId())).thenReturn(new ApiKeyStatus(key.keyId(), key.appId(), owner.id().toString(),
                ApiKeyStatus.State.EXPIRED, List.of("mcp:use")));
        delegate(key.serviceToken(), INTERNAL)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("API_KEY_EXPIRED"));
    }

    @Test
    void aDisabledAppGetsNoToken() throws Exception {
        TestUser owner = developer("delegate-app-off");
        Key key = keyFor(owner, "mcp:use", "products:use");
        when(apiKeys.status(key.keyId())).thenReturn(new ApiKeyStatus(key.keyId(), key.appId(), owner.id().toString(),
                ApiKeyStatus.State.APP_DISABLED, List.of("mcp:use")));
        delegate(key.serviceToken(), INTERNAL)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("APP_DISABLED"));
    }

    @Test
    void aTokenWhoseAppOrOwnerNoLongerMatchesTheKeyGetsNoToken() throws Exception {
        TestUser owner = developer("delegate-mismatch");
        Key key = keyFor(owner, "mcp:use", "products:use");
        when(apiKeys.status(key.keyId())).thenReturn(new ApiKeyStatus(key.keyId(), UUID.randomUUID(),
                owner.id().toString(), ApiKeyStatus.State.ACTIVE, List.of("mcp:use")));
        delegate(key.serviceToken(), INTERNAL)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("API_KEY_MISMATCH"));
    }

    @Test
    void aWrongOrMissingInternalKeyIs401AndTheKeyIsNotLookedUp() throws Exception {
        Key key = keyFor(developer("delegate-internal"), "mcp:use", "products:use");
        delegate(key.serviceToken(), "not-the-internal-key").andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.accessToken").doesNotExist());
        delegate(key.serviceToken(), null).andExpect(status().isUnauthorized());
        verify(apiKeys, never()).status(key.keyId());
    }

    @Test
    void aSignInTokenIsNoSubstituteForTheInternalKey() throws Exception {
        TestUser owner = developer("delegate-bearer");
        Key key = keyFor(owner, "mcp:use", "products:use");
        mvc.perform(post("/internal/v1/token/delegate").header("Authorization", owner.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"serviceToken\":\"" + key.serviceToken() + "\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void anExpiredServiceTokenIsRefused() throws Exception {
        TestUser owner = developer("delegate-expired");
        UUID keyId = UUID.randomUUID();
        UUID appId = UUID.randomUUID();
        active(keyId, appId, owner, "products:use");
        String expired = forge(serviceClaims(keyId, appId, owner.id(), Instant.now().minusSeconds(5)).build(),
                signingKeys.activeKey().kid(), signingKeys.activeKey().privateKey());
        delegate(expired, INTERNAL).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("SERVICE_TOKEN_INVALID"));
    }

    @Test
    void aForgedOrNonServiceTokenIsRefused() throws Exception {
        TestUser owner = developer("delegate-forged");
        UUID keyId = UUID.randomUUID();
        UUID appId = UUID.randomUUID();
        active(keyId, appId, owner, "products:use");
        Instant later = Instant.now().plusSeconds(300);

        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        String foreign = forge(serviceClaims(keyId, appId, owner.id(), later).build(), signingKeys.activeKey().kid(),
                (RSAPrivateKey) gen.generateKeyPair().getPrivate());
        delegate(foreign, INTERNAL).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("SERVICE_TOKEN_INVALID"));

        String userShaped = forge(serviceClaims(keyId, appId, owner.id(), later).claim("token_use", "platform").build(),
                signingKeys.activeKey().kid(), signingKeys.activeKey().privateKey());
        delegate(userShaped, INTERNAL).andExpect(status().isUnauthorized());

        String otherIssuer = forge(serviceClaims(keyId, appId, owner.id(), later).issuer("http://evil.test").build(),
                signingKeys.activeKey().kid(), signingKeys.activeKey().privateKey());
        delegate(otherIssuer, INTERNAL).andExpect(status().isUnauthorized());

        delegate("garbage", INTERNAL).andExpect(status().isUnauthorized());
        verify(apiKeys, never()).status(any());
    }

    private static JWTClaimsSet.Builder serviceClaims(UUID keyId, UUID appId, UUID owner, Instant exp) {
        Instant now = Instant.now();
        return new JWTClaimsSet.Builder()
                .issuer("http://auth.test")
                .subject("app:" + appId)
                .audience("trove-platform")
                .issueTime(Date.from(now.minusSeconds(10)))
                .expirationTime(Date.from(exp))
                .jwtID(UUID.randomUUID().toString())
                .claim("token_use", "service")
                .claim("permissions", List.of("products:use"))
                .claim("key_id", keyId.toString())
                .claim("owner_uid", owner.toString())
                .claim("act", Map.of("sub", owner.toString()));
    }

    private static String forge(JWTClaimsSet claims, String kid, RSAPrivateKey key) throws Exception {
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(kid).type(JOSEObjectType.JWT).build(),
                claims);
        jwt.sign(new RSASSASigner(key));
        return jwt.serialize();
    }
}
