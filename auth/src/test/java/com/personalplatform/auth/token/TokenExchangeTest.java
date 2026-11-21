package com.personalplatform.auth.token;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
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
import com.personalplatform.auth.rbac.RbacService;
import com.personalplatform.auth.user.UserService;
import java.util.List;
import java.util.Set;
import org.jooq.DSLContext;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.web.servlet.MockMvc;

@AuthIntegrationTest
@ExtendWith(OutputCaptureExtension.class)
class TokenExchangeTest {

    private static final String KEK = "dGVzdC1vbmx5LWtleS1lbmNyeXB0aW9uLWtleS0zMmI=";

    @Autowired MockMvc mvc;
    @Autowired DSLContext dsl;
    @Autowired SigningKeyService keys;
    @Autowired PlatformTokenIssuer issuer;
    @Autowired UserService users;
    @Autowired RbacService rbac;

    private String exchange(TestUser user) throws Exception {
        String body = mvc.perform(post("/v1/token/exchange").header("Authorization", user.bearer()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.accessToken");
    }

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
    void exchangeReturnsASignedTokenWhoseClaimsMatchTheUser() throws Exception {
        TestUser dev = TestUsers.newUser(mvc, "dev");
        TestUsers.giveRole(dsl, dev, "DEVELOPER");

        String body = mvc.perform(post("/v1/token/exchange").header("Authorization", dev.bearer()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.expiresIn").value(600))
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andReturn().getResponse().getContentAsString();
        SignedJWT jwt = SignedJWT.parse(JsonPath.read(body, "$.accessToken"));

        assertThat(jwt.getHeader().getAlgorithm().getName()).isEqualTo("RS256");
        assertThat(verifies(jwt, jwks())).as("signature verifies against the JWKS").isTrue();

        JWTClaimsSet c = jwt.getJWTClaimsSet();
        assertThat(c.getIssuer()).isEqualTo("http://auth.test");
        assertThat(c.getAudience()).containsExactly("trove-platform");
        assertThat(c.getStringClaim("token_use")).isEqualTo("platform");
        assertThat(c.getSubject()).isEqualTo(dev.uid());
        assertThat(c.getStringClaim("uid")).isEqualTo(dev.id().toString());
        assertThat(c.getStringClaim("email")).isEqualTo(dev.email());
        assertThat(c.getStringListClaim("roles")).containsExactlyInAnyOrder("MEMBER", "DEVELOPER");
        assertThat(c.getStringListClaim("permissions"))
                .containsExactlyInAnyOrderElementsOf(rbac.permissionsFor(Set.of("MEMBER", "DEVELOPER")));
        assertThat(c.getStringClaim("plan")).isEqualTo("FREE");
        assertThat(c.getStringListClaim("workspaces")).isEmpty();
        assertThat(c.getLongClaim("pv")).isEqualTo(1L);
        assertThat(c.getClaim("act")).as("no impersonation").isNull();
        assertThat(c.getExpirationTime().getTime() - c.getIssueTime().getTime()).isEqualTo(600_000L);
    }

    @Test
    void tokenReflectsPlanAndPermissionsVersionAndImpersonationActor() throws Exception {
        TestUser user = TestUsers.newUser(mvc, "pv");
        dsl.execute("update auth.users set plan = 'PRO', permissions_version = 7 where id = ?", user.id());

        var authUser = users.resolve(org.springframework.security.oauth2.jwt.Jwt.withTokenValue("x")
                .header("alg", "none").subject(user.uid()).build());
        JWTClaimsSet c = SignedJWT.parse(issuer.issue(authUser, java.util.Optional.of("uid-support-agent")))
                .getJWTClaimsSet();

        assertThat(c.getStringClaim("plan")).isEqualTo("PRO");
        assertThat(c.getLongClaim("pv")).isEqualTo(7L);
        assertThat(c.getStringClaim("act")).isEqualTo("uid-support-agent");
    }

    @Test
    void suspendedUserGetsForbiddenAndNoToken() throws Exception {
        TestUser user = TestUsers.newUser(mvc, "suspended");
        exchange(user); // works before suspension
        TestUsers.suspendDirectly(dsl, user);

        mvc.perform(post("/v1/token/exchange").header("Authorization", user.bearer()))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.code").value("USER_SUSPENDED"))
                .andExpect(jsonPath("$.accessToken").doesNotExist())
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("eyJ"))));
    }

    @Test
    void exchangeNeedsAFirebaseToken() throws Exception {
        mvc.perform(post("/v1/token/exchange")).andExpect(status().isUnauthorized());
        mvc.perform(post("/v1/token/exchange").header("Authorization", "Bearer garbage"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void oldTokensStillVerifyAfterRotationAndNewTokensUseTheNewKid() throws Exception {
        TestUser user = TestUsers.newUser(mvc, "rotate");
        SignedJWT before = SignedJWT.parse(exchange(user));
        String oldKid = before.getHeader().getKeyID();

        String newKid = keys.rotate();

        SignedJWT after = SignedJWT.parse(exchange(user));
        assertThat(newKid).isNotEqualTo(oldKid);
        assertThat(after.getHeader().getKeyID()).isEqualTo(newKid);

        JWKSet set = jwks();
        assertThat(set.getKeys().stream().map(JWK::getKeyID)).contains(oldKid, newKid);
        assertThat(verifies(before, set)).as("token signed before rotation still verifies").isTrue();
        assertThat(verifies(after, set)).isTrue();
        assertThat(dsl.fetchCount(com.personalplatform.sql.jooq.auth.auth.Tables.SIGNING_KEYS,
                        com.personalplatform.sql.jooq.auth.auth.Tables.SIGNING_KEYS.STATUS.eq("ACTIVE")))
                .isEqualTo(1);
    }

    @Test
    void jwksExposesOnlyPublicParameters() throws Exception {
        String body = mvc.perform(get("/.well-known/jwks.json")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<java.util.Map<String, Object>> keyList = JsonPath.read(body, "$.keys");
        assertThat(keyList).isNotEmpty();
        for (var key : keyList) {
            assertThat(key.keySet()).containsOnly("kty", "use", "alg", "kid", "n", "e");
            assertThat(key).containsEntry("kty", "RSA").containsEntry("alg", "RS256").containsEntry("use", "sig");
        }
    }

    @Test
    void privateKeyIsStoredEncryptedAndNeitherKeyNorTokenIsLogged(CapturedOutput output) throws Exception {
        TestUser user = TestUsers.newUser(mvc, "secrets");
        String token = exchange(user);

        byte[] stored = dsl.select(com.personalplatform.sql.jooq.auth.auth.Tables.SIGNING_KEYS.PRIVATE_KEY_ENC)
                .from(com.personalplatform.sql.jooq.auth.auth.Tables.SIGNING_KEYS)
                .where(com.personalplatform.sql.jooq.auth.auth.Tables.SIGNING_KEYS.STATUS.eq("ACTIVE"))
                .fetchOne(com.personalplatform.sql.jooq.auth.auth.Tables.SIGNING_KEYS.PRIVATE_KEY_ENC);
        // PKCS#8 RSA keys start with DER SEQUENCE 0x30 0x82; AES-GCM output (IV first) does not.
        assertThat(stored).isNotNull();
        assertThat(new String(stored, java.nio.charset.StandardCharsets.ISO_8859_1)).doesNotContain("RSA PRIVATE");
        assertThat(output.getAll()).doesNotContain(KEK).doesNotContain(token);
    }
}
