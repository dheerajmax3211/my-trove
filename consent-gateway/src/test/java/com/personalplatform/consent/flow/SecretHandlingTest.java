package com.personalplatform.consent.flow;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.personalplatform.consent.config.ConsentProperties;
import com.personalplatform.consent.keys.KeyCipher;
import com.personalplatform.consent.support.IntegrationTest;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import java.util.List;
import org.jooq.Record;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

@ExtendWith(OutputCaptureExtension.class)
class SecretHandlingTest extends IntegrationTest {

    static final String TEST_KEK_BASE64 = "dGVzdC1vbmx5LWtleS1lbmNyeXB0aW9uLWtleS0zMmI=";

    @Autowired ConsentProperties props;

    @Test
    void clientSecretIsReturnedOnceAndStoredOnlyAsAKdfHash() throws Exception {
        Registered c = registerClient(newOwner(), "profile:read");
        assertThat(c.clientSecret()).startsWith("cs_").hasSizeGreaterThan(40);

        String hash = dsl.resultQuery("select secret_hash from consent.clients where client_id = ?", c.clientId())
                .fetchOne(0, String.class);
        assertThat(hash).startsWith("{bcrypt}$2").doesNotContain(c.clientSecret());

        // the secret appears in no column of any table
        for (String table : List.of("clients", "access_requests", "grants", "issued_tokens", "audit_log", "audit_heads",
                "attributes", "signing_keys")) {
            String dump = dsl.resultQuery("select coalesce(string_agg(cast(t as text), ' '), '') from consent." + table + " t")
                    .fetchOne(0, String.class);
            assertThat(dump).as("table " + table).doesNotContain(c.clientSecret());
        }
    }

    @Test
    void clientReadsNeverReturnSecretOrHash() throws Exception {
        String owner = newOwner();
        Registered c = registerClient(owner, "profile:read");
        String one = ownerGet(owner, "/v1/owner/clients/" + c.clientId()).andReturn().getResponse().getContentAsString();
        String all = ownerGet(owner, "/v1/owner/clients").andReturn().getResponse().getContentAsString();
        for (String body : List.of(one, all)) {
            assertThat(body).doesNotContain(c.clientSecret()).doesNotContain("clientSecret").doesNotContain("secretHash").doesNotContain("bcrypt");
        }
    }

    @Test
    void registrationResponsesAreNotCacheable() throws Exception {
        ownerPost(newOwner(), "/v1/owner/clients", "{'name':'x','allowedScopes':['a:read']}")
                .andExpect(status().isCreated())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")));
    }

    @Test
    void secretsTokensAndKeysNeverReachTheLogs(CapturedOutput output) throws Exception {
        String owner = newOwner();
        putAttribute(owner, "profile.sizes.shoe", "'log-canary-value-43'", "PERSONAL");
        Access a = grantAccess(owner, "profile.sizes:read");
        readData(a.accessToken(), null).andExpect(status().isOk());
        readData(a.accessToken(), "path=health").andExpect(status().isForbidden());
        tokenRequest(a.client().clientId(), "WRONG-SECRET-ATTEMPT-XYZ").andExpect(status().isUnauthorized());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/v1/gateway/data")
                .header("Authorization", "Bearer " + a.accessToken() + "tampered")).andExpect(status().isUnauthorized());
        // exercise the failure paths of the owner chain as well
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/v1/owner/clients")
                .header("Authorization", "Bearer garbage-token-value")).andExpect(status().isUnauthorized());

        String logs = output.getAll();
        assertThat(logs).as("something was logged at all").contains("consent");
        assertThat(logs).doesNotContain(a.client().clientSecret());
        assertThat(logs).doesNotContain("WRONG-SECRET-ATTEMPT-XYZ");
        assertThat(logs).doesNotContain(a.accessToken());
        assertThat(logs).doesNotContain(a.accessToken().split("\\.")[2]); // signature part
        assertThat(logs).doesNotContain("log-canary-value-43");
        assertThat(logs).doesNotContain("PRIVATE KEY");
        assertThat(logs).doesNotContain(TEST_KEK_BASE64).doesNotContain("test-only-key-encryption-key");
        assertThat(logs).doesNotContain(privateKeyBase64Fragment());
        // the failed login is logged by client id only
        assertThat(logs).contains("Client authentication failed for client_id=" + a.client().clientId());
    }

    @Test
    void propertiesAndSecretHoldersRedactTheirSecrets() {
        assertThat(props.toString()).doesNotContain(TEST_KEK_BASE64).contains("<redacted>");
        var secretHolder = new com.personalplatform.consent.client.ClientService.ClientWithSecret(null, "cs_supersecret");
        assertThat(secretHolder.toString()).doesNotContain("cs_supersecret");
    }

    @Test
    void signingKeyIsEncryptedAtRestAndBoundToItsKid() throws Exception {
        String activeKid = (String) dsl.resultQuery("select kid from consent.signing_keys where status = 'ACTIVE'").fetchOne(0);
        Record row = dsl.resultQuery("select private_key_enc, enc_alg, public_jwk from consent.signing_keys where kid = ?", activeKid).fetchOne();
        byte[] blob = row.get(0, byte[].class);
        assertThat(row.get(1, String.class)).isEqualTo("AES-256-GCM-v1");
        assertThat(row.get(2, String.class)).doesNotContain("\"d\"");

        KeyCipher right = KeyCipher.fromBase64(TEST_KEK_BASE64);
        byte[] pkcs8 = right.decrypt(activeKid, blob);
        // ciphertext is not the key: no 16-byte window of the plaintext key appears in the stored bytes
        String stored = new String(blob, StandardCharsets.ISO_8859_1);
        String plain = new String(pkcs8, StandardCharsets.ISO_8859_1);
        for (int i = 0; i + 16 < plain.length(); i += 97) {
            assertThat(stored).doesNotContain(plain.substring(i, i + 16));
        }
        // the decrypted key is the private half of the published public key
        RSAPrivateCrtKey priv = (RSAPrivateCrtKey) KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(pkcs8));
        RSAKey pub = (RSAKey) JWKSet.parse("{\"keys\":[" + row.get(2, String.class) + "]}").getKeyByKeyId(activeKid);
        assertThat(priv.getModulus()).isEqualTo(pub.toRSAPublicKey().getModulus());

        // wrong key-encryption key, or the blob moved to another kid, cannot decrypt
        KeyCipher wrong = new KeyCipher("ffffffffffffffffffffffffffffffff".getBytes(StandardCharsets.UTF_8));
        assertThatThrownBy(() -> wrong.decrypt(activeKid, blob)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> right.decrypt("another-kid", blob)).isInstanceOf(IllegalStateException.class);
    }

    private String privateKeyBase64Fragment() throws Exception {
        String kid = (String) dsl.resultQuery("select kid from consent.signing_keys where status = 'ACTIVE'").fetchOne(0);
        byte[] blob = dsl.resultQuery("select private_key_enc from consent.signing_keys where kid = ?", kid).fetchOne(0, byte[].class);
        byte[] pkcs8 = KeyCipher.fromBase64(TEST_KEK_BASE64).decrypt(kid, blob);
        // a fragment from the middle of the key body (the first bytes are a common ASN.1 header)
        return Base64.getEncoder().encodeToString(pkcs8).substring(200, 260);
    }
}
