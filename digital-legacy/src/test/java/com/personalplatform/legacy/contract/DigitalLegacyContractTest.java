package com.personalplatform.legacy.contract;

import static com.personalplatform.legacy.contract.ContractSchemas.assertMatches;

import com.personalplatform.legacy.support.LegacyIntegrationBase;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * The real owner API's responses match {@code contracts/digital-legacy/*.schema.json}, the same files the
 * workspace's demo-mode mock is checked against: once before a vault exists, once for an armed vault whose three
 * trustees hold sealed shares.
 */
class DigitalLegacyContractTest extends LegacyIntegrationBase {

    private String okBody(String uid, String method, String path, Object body) throws Exception {
        return body(ok(switch (method) {
            case "GET" -> oGet(uid, path);
            case "POST" -> oPost(uid, path, body);
            default -> throw new IllegalArgumentException(method);
        }));
    }

    @Test
    void anOwnerWithoutAVaultGetsTheContractShapes() throws Exception {
        String uid = uniqueUid("contract-empty");
        assertMatches("digital-legacy/vault.schema.json", okBody(uid, "GET", "/v1/legacy/vault", null));
        assertMatches("digital-legacy/state.schema.json", okBody(uid, "GET", "/v1/legacy/vault/state", null));
        assertMatches("digital-legacy/ciphertext.schema.json", okBody(uid, "GET", "/v1/legacy/vault/ciphertext", null));
        assertMatches("digital-legacy/chain.schema.json", okBody(uid, "GET", "/v1/legacy/vault/audit/verify", null));
    }

    @Test
    void anArmedVaultWithTrusteesMatchesTheContracts() throws Exception {
        Team team = setupTeam(uniqueUid("contract-armed"), 3, 2, true);
        String uid = team.uid;
        assertMatches("digital-legacy/vault.schema.json", okBody(uid, "GET", "/v1/legacy/vault", null));
        assertMatches("digital-legacy/state.schema.json", okBody(uid, "GET", "/v1/legacy/vault/state", null));
        assertMatches("digital-legacy/state.schema.json", okBody(uid, "POST", "/v1/legacy/vault/checkin", null));
        assertMatches("digital-legacy/state.schema.json",
                okBody(uid, "POST", "/v1/legacy/vault/pause", Map.of("durationSeconds", 3600)));
        assertMatches("digital-legacy/state.schema.json", okBody(uid, "POST", "/v1/legacy/vault/resume", null));
        assertMatches("digital-legacy/ciphertext.schema.json", okBody(uid, "GET", "/v1/legacy/vault/ciphertext", null));
        assertMatches("digital-legacy/timeline.schema.json", okBody(uid, "GET", "/v1/legacy/vault/timeline", null));
        assertMatches("digital-legacy/chain.schema.json", okBody(uid, "GET", "/v1/legacy/vault/audit/verify", null));
        assertMatches("digital-legacy/trustee-list.schema.json", okBody(uid, "GET", "/v1/legacy/vault/trustees", null));
        assertMatches("digital-legacy/invite.schema.json",
                okBody(uid, "POST", "/v1/legacy/vault/trustees", Map.of("label", "Dee")));
        assertMatches("digital-legacy/trustee-list.schema.json", okBody(uid, "GET", "/v1/legacy/vault/trustees", null));
    }
}
