package com.personalplatform.consent.flow;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.personalplatform.consent.keys.SigningKeyService;
import com.personalplatform.consent.support.IntegrationTest;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

class TokenIssuerTest extends IntegrationTest {

    @Autowired SigningKeyService keys;

    private static String kidOf(String token) throws Exception {
        return SignedJWT.parse(token).getHeader().getKeyID();
    }

    private List<String> jwksKids() throws Exception {
        String body = mvc.perform(get("/.well-known/jwks.json")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JWKSet.parse(body).getKeys().stream().map(k -> k.getKeyID()).toList();
    }

    /** 404 = the token was accepted (authenticated, but the request id does not exist); 401 = rejected. */
    private int statusWith(String token) throws Exception {
        return mvc.perform(get("/v1/gateway/requests/" + UUID.randomUUID()).header("Authorization", bearer(token)))
                .andReturn().getResponse().getStatus();
    }

    private ResultActions introspect(Registered caller, String token) throws Exception {
        String basic = Base64.getEncoder().encodeToString((caller.clientId() + ":" + caller.clientSecret()).getBytes(StandardCharsets.UTF_8));
        return mvc.perform(post("/v1/oauth/introspect").header("Authorization", "Basic " + basic)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED).param("token", token));
    }

    private ResultActions revoke(Registered caller, String token) throws Exception {
        return mvc.perform(post("/v1/oauth/revoke")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("client_id", caller.clientId()).param("client_secret", caller.clientSecret()).param("token", token));
    }

    @Test
    void tokenIsRs256WithKidAndVerifiesOfflineAgainstThePublicJwks() throws Exception {
        Registered c = registerClient(newOwner(), "profile:read");
        String token = clientToken(c);
        SignedJWT jwt = SignedJWT.parse(token);

        assertThat(jwt.getHeader().getAlgorithm()).isEqualTo(JWSAlgorithm.RS256);
        assertThat(jwt.getHeader().getType()).isEqualTo(new JOSEObjectType("at+jwt"));
        assertThat(jwt.getHeader().getKeyID()).isNotBlank();
        JWTClaimsSet claims = jwt.getJWTClaimsSet();
        assertThat(claims.getSubject()).isEqualTo(c.clientId());
        assertThat(claims.getIssuer()).isEqualTo("http://localhost:8084");
        assertThat(claims.getAudience()).containsExactly("consent-gateway");
        assertThat(claims.getJWTID()).isNotBlank();
        assertThat(claims.getStringClaim("token_use")).isEqualTo("client");
        assertThat(claims.getExpirationTime().toInstant()).isEqualTo(claims.getIssueTime().toInstant().plusSeconds(300));

        // a relying party needs nothing but the public JWKS
        String jwks = mvc.perform(get("/.well-known/jwks.json")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("max-age=60")))
                .andReturn().getResponse().getContentAsString();
        RSAKey key = (RSAKey) JWKSet.parse(jwks).getKeyByKeyId(jwt.getHeader().getKeyID());
        assertThat(key).isNotNull();
        assertThat(jwt.verify(new RSASSAVerifier(key))).isTrue();
        assertThat(statusWith(token)).isEqualTo(404);
    }

    @Test
    void jwksPublishesPublicKeyMaterialOnly() throws Exception {
        String body = mvc.perform(get("/.well-known/jwks.json")).andReturn().getResponse().getContentAsString();
        for (String privateMember : new String[] {"\"d\"", "\"p\"", "\"q\"", "\"dp\"", "\"dq\"", "\"qi\""}) {
            assertThat(body).doesNotContain(privateMember);
        }
        assertThat(body).contains("\"kty\":\"RSA\"", "\"use\":\"sig\"", "\"alg\":\"RS256\"", "\"kid\"");
    }

    @Test
    void tokensExpire_withTheConfiguredSkew() throws Exception {
        String token = clientToken(registerClient(newOwner(), "profile:read"));
        assertThat(statusWith(token)).isEqualTo(404);
        clock.advance(Duration.ofSeconds(300 + 10)); // past exp, inside the 30s skew
        assertThat(statusWith(token)).isEqualTo(404);
        clock.advance(Duration.ofSeconds(40)); // beyond exp + skew
        assertThat(statusWith(token)).isEqualTo(401);
    }

    @Test
    void rotation_oldKidStillVerifies_newTokensUseTheNewKid_jwksShowsBoth() throws Exception {
        Registered c = registerClient(newOwner(), "profile:read");
        String oldToken = clientToken(c);
        String oldKid = kidOf(oldToken);

        String newKid = keys.rotate();
        assertThat(newKid).isNotEqualTo(oldKid);

        // old token: signed by the retired key, still honoured until it expires
        assertThat(statusWith(oldToken)).isEqualTo(404);
        // new tokens are signed by the new key
        String newToken = clientToken(c);
        assertThat(kidOf(newToken)).isEqualTo(newKid);
        assertThat(statusWith(newToken)).isEqualTo(404);
        // JWKS publishes both, so verifiers keep working across the rotation
        assertThat(jwksKids()).contains(oldKid, newKid);

        // once every token the old key signed has expired (+ skew), the old key leaves the JWKS
        clock.advance(Duration.ofMinutes(6));
        assertThat(jwksKids()).contains(newKid).doesNotContain(oldKid);
        assertThat(statusWith(oldToken)).isEqualTo(401);
        // a fresh token after the grace period still works
        assertThat(statusWith(clientToken(c))).isEqualTo(404);
    }

    @Test
    void forgedTokensAreRejected() throws Exception {
        Registered c = registerClient(newOwner(), "profile:read");
        String good = clientToken(c);
        SignedJWT parsed = SignedJWT.parse(good);
        String kid = parsed.getHeader().getKeyID();
        JWTClaimsSet claims = parsed.getJWTClaimsSet();

        // 1. payload swapped, signature kept
        JWTClaimsSet evil = new JWTClaimsSet.Builder(claims).subject("cl_someone_else").build();
        String[] parts = good.split("\\.");
        String swapped = parts[0] + "." + Base64.getUrlEncoder().withoutPadding()
                .encodeToString(evil.toString().getBytes(StandardCharsets.UTF_8)) + "." + parts[2];
        assertThat(statusWith(swapped)).isEqualTo(401);

        // 2. alg=none
        String none = Base64.getUrlEncoder().withoutPadding().encodeToString(
                ("{\"alg\":\"none\",\"typ\":\"at+jwt\",\"kid\":\"" + kid + "\"}").getBytes(StandardCharsets.UTF_8))
                + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(claims.toString().getBytes(StandardCharsets.UTF_8)) + ".";
        assertThat(statusWith(none)).isEqualTo(401);

        // 3. HS256 confusion: MAC keyed with the PUBLIC key bytes
        String jwks = mvc.perform(get("/.well-known/jwks.json")).andReturn().getResponse().getContentAsString();
        byte[] publicBytes = ((RSAKey) JWKSet.parse(jwks).getKeyByKeyId(kid)).toRSAPublicKey().getEncoded();
        SignedJWT hs = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.HS256).keyID(kid).type(new JOSEObjectType("at+jwt")).build(), claims);
        hs.sign(new MACSigner(publicBytes));
        assertThat(statusWith(hs.serialize())).isEqualTo(401);

        // 4. signed by an attacker's own RSA key but claiming a real kid
        RSAKey attacker = new RSAKeyGenerator(2048).keyID(kid).generate();
        SignedJWT rs = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(kid).type(new JOSEObjectType("at+jwt")).build(), claims);
        rs.sign(new RSASSASigner(attacker));
        assertThat(statusWith(rs.serialize())).isEqualTo(401);

        // 5. validly signed shape but an unknown kid and a wrong audience / issuer cannot succeed either
        RSAKey unknown = new RSAKeyGenerator(2048).keyID("unknown-kid").generate();
        SignedJWT other = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("unknown-kid").type(new JOSEObjectType("at+jwt")).build(),
                new JWTClaimsSet.Builder(claims).expirationTime(new Date(clock.instant().plusSeconds(60).toEpochMilli())).build());
        other.sign(new RSASSASigner(unknown));
        assertThat(statusWith(other.serialize())).isEqualTo(401);

        // 6. garbage
        assertThat(statusWith("not.a.jwt")).isEqualTo(401);
        assertThat(statusWith("x")).isEqualTo(401);
        // the genuine token is unaffected
        assertThat(statusWith(good)).isEqualTo(404);
    }

    @Test
    void accessTokenNeverOutlivesItsGrant() throws Exception {
        Access a = grantAccess(newOwner(), 120, null, null, "profile.sizes:read");
        SignedJWT jwt = SignedJWT.parse(a.accessToken());
        assertThat(jwt.getJWTClaimsSet().getStringClaim("token_use")).isEqualTo("access");
        assertThat(jwt.getJWTClaimsSet().getStringClaim("grant_id")).isEqualTo(a.grantId());
        assertThat(jwt.getJWTClaimsSet().getStringClaim("scope")).isEqualTo("profile.sizes:read");
        long ttl = jwt.getJWTClaimsSet().getExpirationTime().toInstant().getEpochSecond()
                - jwt.getJWTClaimsSet().getIssueTime().toInstant().getEpochSecond();
        assertThat(ttl).isLessThanOrEqualTo(120);
    }

    @Test
    void introspectionReflectsLiveState() throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.sizes.shoe", "43", "PERSONAL");
        Access a = grantAccess(owner, "profile.sizes:read");
        Registered other = registerClient(newOwner(), "profile:read");

        introspect(a.client(), a.accessToken()).andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.client_id").value(a.client().clientId()))
                .andExpect(jsonPath("$.token_use").value("access"))
                .andExpect(jsonPath("$.grant_id").value(a.grantId()))
                .andExpect(jsonPath("$.scope").value("profile.sizes:read"));
        // another client may not learn anything about this token
        introspect(other, a.accessToken()).andExpect(jsonPath("$.active").value(false));
        // unauthenticated callers get 401, garbage is merely inactive
        mvc.perform(post("/v1/oauth/introspect").contentType(MediaType.APPLICATION_FORM_URLENCODED).param("token", a.accessToken()))
                .andExpect(status().isUnauthorized());
        introspect(a.client(), "garbage").andExpect(jsonPath("$.active").value(false));

        // revoking the GRANT makes the (still unexpired) access token inactive
        ownerPost(owner, "/v1/owner/grants/" + a.grantId() + "/revoke", null).andExpect(status().isOk());
        introspect(a.client(), a.accessToken()).andExpect(jsonPath("$.active").value(false));
    }

    @Test
    void introspectionOfExpiredTokenIsInactive() throws Exception {
        Registered c = registerClient(newOwner(), "profile:read");
        String token = clientToken(c);
        introspect(c, token).andExpect(jsonPath("$.active").value(true));
        clock.advance(Duration.ofMinutes(6));
        introspect(c, token).andExpect(jsonPath("$.active").value(false));
    }

    @Test
    void revokedTokenIsRejectedImmediately_andOnlyItsOwnerCanRevokeIt() throws Exception {
        Registered c = registerClient(newOwner(), "profile:read");
        Registered other = registerClient(newOwner(), "profile:read");
        String token = clientToken(c);
        assertThat(statusWith(token)).isEqualTo(404);

        revoke(other, token).andExpect(status().isOk()); // not theirs: silently ignored
        assertThat(statusWith(token)).isEqualTo(404);

        revoke(c, token).andExpect(status().isOk());
        assertThat(statusWith(token)).isEqualTo(401);
        introspect(c, token).andExpect(jsonPath("$.active").value(false));
        mvc.perform(post("/v1/oauth/revoke").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("client_id", c.clientId()).param("client_secret", "bad").param("token", token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void clientTokensAndAccessTokensAreNotInterchangeable() throws Exception {
        String owner = newOwner();
        Access a = grantAccess(owner, "profile.sizes:read");
        String clientToken = clientToken(a.client());

        // client token cannot read data
        readData(clientToken, null).andExpect(status().isForbidden());
        // access token cannot create requests or mint further tokens
        mvc.perform(post("/v1/gateway/requests").header("Authorization", bearer(a.accessToken())).contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'scopes':['profile.sizes:read'],'purpose':'x','durationSeconds':600}")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/v1/gateway/grants/" + a.grantId() + "/token").header("Authorization", bearer(a.accessToken())))
                .andExpect(status().isForbidden());
    }

    @Test
    void firebaseAndGatewayChainsAreSeparate() throws Exception {
        String owner = newOwner();
        Registered c = registerClient(owner, "profile:read");
        String gatewayToken = clientToken(c);
        String firebaseToken = ownerBearer(owner).substring(7);

        // a gateway token is no use on the owner API ...
        mvc.perform(get("/v1/owner/vault/attributes").header("Authorization", bearer(gatewayToken))).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/owner/clients").header("Authorization", bearer(gatewayToken))).andExpect(status().isUnauthorized());
        // ... and a Firebase token is no use on the gateway API
        mvc.perform(get("/v1/gateway/data").header("Authorization", bearer(firebaseToken))).andExpect(status().isUnauthorized());
        mvc.perform(post("/v1/gateway/requests").header("Authorization", bearer(firebaseToken)).contentType(MediaType.APPLICATION_JSON)
                .content("{}")).andExpect(status().isUnauthorized());
        // both chains refuse anonymous callers
        mvc.perform(get("/v1/owner/vault/attributes")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/gateway/data")).andExpect(status().isUnauthorized());
        // public things stay public
        mvc.perform(get("/.well-known/jwks.json")).andExpect(status().isOk());
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
        // the owner chain still works with a Firebase token (the platform decoder was not displaced)
        mvc.perform(get("/v1/owner/vault/attributes").header("Authorization", ownerBearer(owner))).andExpect(status().isOk());
    }
}
