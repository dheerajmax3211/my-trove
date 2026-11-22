package com.personalplatform.legacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.legacy.support.ClientCrypto;
import com.personalplatform.legacy.support.LegacyIntegrationBase;
import com.personalplatform.legacy.support.RecordingNotificationOutbox;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** Inviting a trustee by email sends the invite link to them; the token is in that email and in the owner's response. */
class TrusteeInviteEmailTest extends LegacyIntegrationBase {

    @Autowired RecordingNotificationOutbox outbox;

    private Map<String, Object> vaultBody() {
        var enc = ClientCrypto.encryptVault(ClientCrypto.newVaultKey(RND), "hello".getBytes(), RND);
        return new HashMap<>(Map.of("ciphertext", enc.ciphertextB64(), "metadata", enc.metadata()));
    }

    @Test
    void theInviteLinkIsEmailedToTheTrusteeWhenAnAddressIsGiven() throws Exception {
        String uid = uniqueUid("invite-mail");
        String address = "anna-" + UUID.randomUUID() + "@example.com";
        oPost(uid, "/v1/legacy/vault", vaultBody()).andExpect(status().isCreated());

        String inviteBody = body(oPost(uid, "/v1/legacy/vault/trustees",
                Map.of("label", "Anna", "email", address)));
        String token = JsonPath.read(inviteBody, "$.inviteToken");

        assertThat(outbox.toAddress(address)).singleElement().satisfies(n -> {
            assertThat(n.kind()).isEqualTo("TRUSTEE_INVITE");
            assertThat(n.inApp()).isFalse();
            assertThat(n.body()).contains("/trustee/accept#invite=" + token);
        });
    }

    @Test
    void noEmailWhenTheOwnerSendsTheLinkThemselves() throws Exception {
        String uid = uniqueUid("invite-manual");
        oPost(uid, "/v1/legacy/vault", vaultBody()).andExpect(status().isCreated());
        long before = outbox.countKind("TRUSTEE_INVITE");
        oPost(uid, "/v1/legacy/vault/trustees", Map.of("label", "Ben")).andExpect(status().isCreated());
        assertThat(outbox.countKind("TRUSTEE_INVITE")).isEqualTo(before);
    }
}
