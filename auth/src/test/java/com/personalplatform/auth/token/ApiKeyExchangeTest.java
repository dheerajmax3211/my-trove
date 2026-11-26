package com.personalplatform.auth.token;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.personalplatform.auth.AuthIntegrationTest;
import com.personalplatform.auth.TestUsers;
import com.personalplatform.auth.TestUsers.TestUser;
import java.util.List;
import java.util.UUID;
import org.jooq.DSLContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * W4 item 3: {@code Authorization: Bearer pk_...} on the token exchange. The key is verified by the platform service
 * (mocked here; the HTTP client has its own test) and exchanged for a {@code token_use=service} token whose permissions
 * are exactly the key's, never the owner's.
 */
@AuthIntegrationTest
class ApiKeyExchangeTest {

    static final String KEY = "pk_0a1b2c3d_" + "s".repeat(43);

    @Autowired MockMvc mvc;
    @Autowired DSLContext dsl;

    @MockitoBean ApiKeyVerifier verifier;

    private JWKSet jwks() throws Exception {
        String body = mvc.perform(get("/.well-known/jwks.json")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JWKSet.parse(body);
    }

    private static boolean verifies(SignedJWT jwt, JWKSet set) throws Exception {
        JWK key = set.getKeyByKeyId(jwt.getHeader().getKeyID());
        return key != null && jwt.verify(new RSASSAVerifier((RSAKey) key));
    }

    @Test
    void validKeyExchangesForAServiceTokenScopedToTheKeyOnly() throws Exception {
        TestUser owner = TestUsers.newUser(mvc, "pk-owner");
        TestUsers.giveRole(dsl, owner, "DEVELOPER");
        UUID keyId = UUID.randomUUID();
        UUID appId = UUID.randomUUID();
        when(verifier.verify(KEY)).thenReturn(new VerifiedApiKey(keyId, appId, owner.id().toString(),
                List.of("usage:read"), List.of("usage:read:self")));

        String body = mvc.perform(post("/v1/token/exchange").header("Authorization", "Bearer " + KEY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.expiresIn").value(600))
                .andReturn().getResponse().getContentAsString();
        SignedJWT jwt = SignedJWT.parse(JsonPath.read(body, "$.accessToken"));

        assertThat(verifies(jwt, jwks())).as("signature verifies against the JWKS").isTrue();
        JWTClaimsSet c = jwt.getJWTClaimsSet();
        assertThat(c.getIssuer()).isEqualTo("http://auth.test");
        assertThat(c.getAudience()).containsExactly("trove-platform");
        assertThat(c.getStringClaim("token_use")).isEqualTo("service");
        assertThat(c.getSubject()).isEqualTo("app:" + appId);
        assertThat(c.getStringListClaim("scopes")).containsExactly("usage:read");
        assertThat(c.getStringListClaim("permissions")).as("the key's permissions, not the owner's").containsExactly("usage:read:self");
        assertThat(c.getClaim("roles")).as("a service token carries no roles").isNull();
        assertThat(c.getStringClaim("key_id")).isEqualTo(keyId.toString());
        assertThat(c.getStringClaim("owner_uid")).isEqualTo(owner.id().toString());
        assertThat(c.getJSONObjectClaim("act")).as("RFC 8693 actor names the owner the key acts for")
                .containsExactly(java.util.Map.entry("sub", owner.id().toString()));
        assertThat(c.getStringClaim("plan")).isEqualTo("FREE");
        assertThat(c.getExpirationTime().getTime() - c.getIssueTime().getTime()).isEqualTo(600_000L);
    }

    @Test
    void refusedKeyIsAProblem401WithNoToken() throws Exception {
        when(verifier.verify("pk_bad00000_" + "x".repeat(43))).thenThrow(new InvalidApiKeyException());
        mvc.perform(post("/v1/token/exchange").header("Authorization", "Bearer pk_bad00000_" + "x".repeat(43)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("API_KEY_INVALID"))
                .andExpect(jsonPath("$.accessToken").doesNotExist());
    }

    @Test
    void keyOfASuspendedOwnerGetsForbiddenAndNoToken() throws Exception {
        TestUser owner = TestUsers.newUser(mvc, "pk-suspended");
        TestUsers.suspendDirectly(dsl, owner);
        when(verifier.verify("pk_susp0000_" + "y".repeat(43))).thenReturn(new VerifiedApiKey(UUID.randomUUID(),
                UUID.randomUUID(), owner.id().toString(), List.of("usage:read"), List.of("usage:read:self")));
        mvc.perform(post("/v1/token/exchange").header("Authorization", "Bearer pk_susp0000_" + "y".repeat(43)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("USER_SUSPENDED"))
                .andExpect(jsonPath("$.accessToken").doesNotExist());
    }

    @Test
    void keyOfAnUnknownOwnerIsRefused() throws Exception {
        when(verifier.verify("pk_nouser00_" + "z".repeat(43))).thenReturn(new VerifiedApiKey(UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID().toString(), List.of("usage:read"), List.of("usage:read:self")));
        mvc.perform(post("/v1/token/exchange").header("Authorization", "Bearer pk_nouser00_" + "z".repeat(43)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("API_KEY_INVALID"));
    }

    @Test
    void platformServiceOutageIsAProblem503NotARefusal() throws Exception {
        when(verifier.verify(anyString())).thenThrow(new ApiKeyServiceUnavailableException("connection refused"));
        mvc.perform(post("/v1/token/exchange").header("Authorization", "Bearer pk_down0000_" + "w".repeat(43)))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("API_KEY_SERVICE_UNAVAILABLE"));
    }

    @Test
    void aPlainGarbageBearerStillFailsAsBefore() throws Exception {
        mvc.perform(post("/v1/token/exchange").header("Authorization", "Bearer garbage"))
                .andExpect(status().isUnauthorized());
    }
}
