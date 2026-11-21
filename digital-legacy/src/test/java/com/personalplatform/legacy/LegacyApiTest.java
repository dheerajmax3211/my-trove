package com.personalplatform.legacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.legacy.support.ClientCrypto;
import com.personalplatform.legacy.support.LegacyIntegrationBase;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** Owner and trustee HTTP API: authentication, validation, isolation, pause limits. */
class LegacyApiTest extends LegacyIntegrationBase {

    private Map<String, Object> vaultBody() {
        var enc = ClientCrypto.encryptVault(ClientCrypto.newVaultKey(RND), "hello".getBytes(), RND);
        return new HashMap<>(Map.of("ciphertext", enc.ciphertextB64(), "metadata", enc.metadata()));
    }

    // ---- authentication / separate chains ---------------------------------------------------------------

    @Test
    void everyEndpointRequiresTheRightKindOfCredential() throws Exception {
        mvc.perform(get("/v1/legacy/vault")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/legacy/vault").header("Authorization", "Bearer !!!")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/legacy/trustee/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/legacy/trustee/me").header("Authorization", "Trustee nope")).andExpect(status().isUnauthorized());
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());

        Team team = setupTeam(uniqueUid("auth"), 1, 1, false);
        // a Firebase-style owner token is not a trustee credential
        mvc.perform(get("/v1/legacy/trustee/me").header("Authorization", bearer(team.uid)))
                .andExpect(status().isUnauthorized());
        // a trustee token is not an owner credential
        mvc.perform(get("/v1/legacy/vault").header("Authorization", "Trustee " + team.trustees.get(0).token()))
                .andExpect(status().isUnauthorized());
        // (the stub decoder accepts any base64url as a uid, so this decodes to a stranger with no data)
        mvc.perform(get("/v1/legacy/vault").header("Authorization", "Bearer " + team.trustees.get(0).token()))
                .andExpect(status().isNotFound());
        tGet(team.trustees.get(0).token(), "/v1/legacy/trustee/me").andExpect(status().isOk());
    }

    // ---- vault content ---------------------------------------------------------------------------------

    @Test
    void createReadAndUpdateVaultStoresOnlyOpaqueCiphertext() throws Exception {
        String uid = uniqueUid("vault");
        Map<String, Object> body = vaultBody();
        oPost(uid, "/v1/legacy/vault", body).andExpect(status().isCreated())
                .andExpect(jsonPath("$.state").value("ACTIVE")).andExpect(jsonPath("$.armed").value(false))
                .andExpect(jsonPath("$.vaultVersion").value(1)).andExpect(jsonPath("$.ciphertext").doesNotExist());
        oPost(uid, "/v1/legacy/vault", body).andExpect(status().isConflict());
        oGet(uid, "/v1/legacy/vault/ciphertext").andExpect(status().isOk())
                .andExpect(jsonPath("$.ciphertext").value(body.get("ciphertext")));

        oPut(uid, "/v1/legacy/vault", Map.of("ciphertext", vaultBody().get("ciphertext"),
                "metadata", body.get("metadata"), "keyRotated", false))
                .andExpect(status().isOk()).andExpect(jsonPath("$.contentRevision").value(2))
                .andExpect(jsonPath("$.vaultVersion").value(1));
        oPut(uid, "/v1/legacy/vault", Map.of("ciphertext", vaultBody().get("ciphertext"),
                "metadata", body.get("metadata"), "keyRotated", true))
                .andExpect(jsonPath("$.vaultVersion").value(2));
    }

    @Test
    void vaultInputIsValidatedForFormatAndSizeOnly() throws Exception {
        String uid = uniqueUid("badvault");
        Map<String, Object> good = vaultBody();
        @SuppressWarnings("unchecked")
        Map<String, Object> meta = (Map<String, Object>) good.get("metadata");

        Map<String, Object> notBase64 = new HashMap<>(good);
        notBase64.put("ciphertext", "***not base64***");
        oPost(uid, "/v1/legacy/vault", notBase64).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.problems[0]").value(containsString("Base64")));

        Map<String, Object> tiny = new HashMap<>(good);
        tiny.put("ciphertext", Base64.getEncoder().encodeToString(new byte[8]));
        oPost(uid, "/v1/legacy/vault", tiny).andExpect(status().isBadRequest());

        Map<String, Object> huge = new HashMap<>(good);
        huge.put("ciphertext", Base64.getEncoder().encodeToString(new byte[1_048_577]));
        oPost(uid, "/v1/legacy/vault", huge).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.problems[0]").value(containsString("exceeds")));

        for (Map<String, Object> badMeta : List.of(
                with(meta, "alg", "AES-128-CBC"),
                with(meta, "nonce", Base64.getEncoder().encodeToString(new byte[8])),
                with(meta, "v", 2),
                with(meta, "extra", "smuggled plaintext"),
                with(meta, "kdf", Map.of("name", "md5", "salt", Base64.getEncoder().encodeToString(new byte[16]))),
                with(meta, "kdf", Map.of("name", "pbkdf2-sha256", "iterations", 10,
                        "salt", Base64.getEncoder().encodeToString(new byte[16]))))) {
            Map<String, Object> b = new HashMap<>(good);
            b.put("metadata", badMeta);
            oPost(uid, "/v1/legacy/vault", b).andExpect(status().isBadRequest());
        }
        Map<String, Object> withKdf = new HashMap<>(good);
        withKdf.put("metadata", with(meta, "kdf", Map.of("name", "argon2id", "memoryKiB", 65536, "iterations", 3,
                "parallelism", 4, "salt", Base64.getEncoder().encodeToString(new byte[16]))));
        oPost(uid, "/v1/legacy/vault", withKdf).andExpect(status().isCreated());
        // the validation errors never echo what was sent
        String err = body(oPost(uniqueUid("x"), "/v1/legacy/vault", with(good, "metadata", with(meta, "extra", "SMUGGLED-1234"))));
        assertThat(err).doesNotContain("SMUGGLED-1234");
    }

    private static Map<String, Object> with(Map<String, Object> m, String k, Object v) {
        Map<String, Object> c = new LinkedHashMap<>(m);
        c.put(k, v);
        return c;
    }

    // ---- policy ----------------------------------------------------------------------------------------

    @Test
    void policyIsValidated() throws Exception {
        String uid = uniqueUid("policy");
        oPost(uid, "/v1/legacy/vault", vaultBody()).andExpect(status().isCreated());
        oPut(uid, "/v1/legacy/vault/policy", policy(2)).andExpect(status().isOk())
                .andExpect(jsonPath("$.readiness.armable").value(false))
                .andExpect(jsonPath("$.readiness.problems[0]").value(containsString("trustee")));

        oPut(uid, "/v1/legacy/vault/policy", with(policy(2), "checkInIntervalSeconds", 60)).andExpect(status().isBadRequest());
        oPut(uid, "/v1/legacy/vault/policy", with(policy(2), "coolOffSeconds", 10)).andExpect(status().isBadRequest());
        oPut(uid, "/v1/legacy/vault/policy", with(policy(2), "quorum", 0)).andExpect(status().isBadRequest());
        oPut(uid, "/v1/legacy/vault/policy", with(policy(2), "quorum", 11)).andExpect(status().isBadRequest());
        oPut(uid, "/v1/legacy/vault/policy", with(policy(2), "ownerContacts", List.of())).andExpect(status().isBadRequest());
        oPut(uid, "/v1/legacy/vault/policy", with(policy(2), "ownerContacts",
                List.of(Map.of("channel", "EMAIL", "address", "not-an-email")))).andExpect(status().isBadRequest());
        oPut(uid, "/v1/legacy/vault/policy", with(policy(2), "maxPauseSeconds", 400 * D)).andExpect(status().isBadRequest());
        oPut(uid, "/v1/legacy/vault/policy", with(policy(2), "escalationDurationSeconds", D)) // last step at 2d
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.problems", hasItem(containsString("escalationDurationSeconds"))));
        oPut(uid, "/v1/legacy/vault/policy", with(policy(2), "steps", List.of(
                step(D, "NOTICE", "OWNER", List.of("EMAIL")), step(D, "WARNING", "OWNER", List.of("EMAIL")))))
                .andExpect(status().isBadRequest());
        oPut(uid, "/v1/legacy/vault/policy", with(policy(2), "steps", List.of(
                step(0, "URGENT", "OWNER", List.of("EMAIL")), step(D, "NOTICE", "OWNER", List.of("EMAIL")))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.problems", hasItem(containsString("urgency"))));
        oPut(uid, "/v1/legacy/vault/policy", with(policy(2), "steps", List.of())).andExpect(status().isBadRequest());
        oPut(uid, "/v1/legacy/vault/policy", with(policy(2), "steps", List.of(
                step(0, "NOTICE", "OWNER", List.of("EMAIL", "EMAIL"))))).andExpect(status().isBadRequest());
    }

    // ---- invites / trustees ------------------------------------------------------------------------------

    @Test
    void inviteTokensAreSingleUseAndExpire() throws Exception {
        String uid = uniqueUid("invite");
        oPost(uid, "/v1/legacy/vault", vaultBody()).andExpect(status().isCreated());
        String inviteBody = body(oPost(uid, "/v1/legacy/vault/trustees", Map.of("label", "Anna")));
        String token = JsonPath.read(inviteBody, "$.inviteToken");
        var keys = ClientCrypto.generateX25519();
        Map<String, Object> accept = Map.of("inviteToken", token, "keyAlgorithm", "X25519",
                "publicKey", keys.publicKeyB64(),
                "contacts", List.of(Map.of("channel", "EMAIL", "address", "anna@example.com")));

        // a malformed key or contact does not burn the invite
        mvc.perform(post("/v1/legacy/trustee/accept").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(with(accept, "publicKey", Base64.getEncoder().encodeToString(new byte[44])))))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/v1/legacy/trustee/accept").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(with(accept, "contacts",
                        List.of(Map.of("channel", "EMAIL", "address", "nope")))))).andExpect(status().isBadRequest());
        mvc.perform(post("/v1/legacy/trustee/accept").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(with(accept, "keyAlgorithm", "RSA-OAEP")))).andExpect(status().isBadRequest());

        mvc.perform(post("/v1/legacy/trustee/accept").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(accept))).andExpect(status().isCreated());
        mvc.perform(post("/v1/legacy/trustee/accept").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(accept))).andExpect(status().isNotFound());

        // unknown token and expired token look identical
        mvc.perform(post("/v1/legacy/trustee/accept").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(with(accept, "inviteToken", "nonsense")))).andExpect(status().isNotFound());
        String late = JsonPath.read(body(oPost(uid, "/v1/legacy/vault/trustees", Map.of("label", "Late"))), "$.inviteToken");
        clock.advance(Duration.ofDays(15));
        mvc.perform(post("/v1/legacy/trustee/accept").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(with(accept, "inviteToken", late)))).andExpect(status().isNotFound());
    }

    @Test
    void onlyDigestsOfTokensAreStored() throws Exception {
        Team team = setupTeam(uniqueUid("digest"), 1, 1, false);
        Trustee t = team.trustees.get(0);
        String stored = (String) dsl.fetchValue("select access_token_hash from legacy.trustees where id = ?", t.id());
        assertThat(stored).hasSize(64).isNotEqualTo(t.token()).doesNotContain(t.token());
        String all = (String) dsl.fetchValue("select string_agg(t::text, ' ') from legacy.trustees t where id = ?", t.id());
        assertThat(all).doesNotContain(t.token());
    }

    @Test
    void sharesAreValidatedAndBoundToTheCurrentKeyVersion() throws Exception {
        String uid = uniqueUid("share");
        Team team = setupTeam(uid, 2, 2, true);
        Trustee x = team.trustees.get(0); // X25519
        Trustee r = team.trustees.get(1); // RSA
        Map<String, Object> goodForX = ClientCrypto.sealShare(new byte[40], "X25519", x.keys().spki(), team.vaultId, x.id(), 1, RND);
        Map<String, Object> goodForR = ClientCrypto.sealShare(new byte[40], "RSA-OAEP", r.keys().spki(), team.vaultId, r.id(), 1, RND);
        String path = "/v1/legacy/vault/trustees/" + x.id() + "/share";
        // envelope for the wrong key type
        oPut(uid, path, Map.of("sealedShare", goodForR, "vaultVersion", 1)).andExpect(status().isBadRequest());
        // stale key version
        oPut(uid, path, Map.of("sealedShare", goodForX, "vaultVersion", 7)).andExpect(status().isConflict());
        // unknown field, bad sizes
        oPut(uid, path, Map.of("sealedShare", with(goodForX, "plaintext", "x"), "vaultVersion", 1)).andExpect(status().isBadRequest());
        oPut(uid, path, Map.of("sealedShare", with(goodForX, "nonce", "AAAA"), "vaultVersion", 1)).andExpect(status().isBadRequest());
        oPut(uid, path, Map.of("sealedShare", goodForX, "vaultVersion", 1)).andExpect(status().isOk())
                .andExpect(jsonPath("$.shareCurrent").value(true))
                // replacing a share resets the receipt confirmation
                .andExpect(jsonPath("$.shareConfirmed").value(false));
    }

    @Test
    void armingNeedsPolicyAndEnoughShareHolders() throws Exception {
        String uid = uniqueUid("arm");
        oPost(uid, "/v1/legacy/vault", vaultBody()).andExpect(status().isCreated());
        oPost(uid, "/v1/legacy/vault/arm", null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(containsString("no check-in policy")));
        oPut(uid, "/v1/legacy/vault/policy", policy(2)).andExpect(status().isOk());
        oPost(uid, "/v1/legacy/vault/arm", null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(containsString("quorum")));

        Team team = setupTeam(uniqueUid("arm2"), 3, 2, false);
        oPost(team.uid, "/v1/legacy/vault/arm", null).andExpect(status().isOk()).andExpect(jsonPath("$.armed").value(true));
        // quorum may not exceed the number of trustees
        oPut(team.uid, "/v1/legacy/vault/policy", policy(4)).andExpect(status().isConflict());
        // revoking below the quorum while armed is refused
        oDelete(team.uid, "/v1/legacy/vault/trustees/" + team.trustees.get(0).id()).andExpect(status().isNoContent());
        oDelete(team.uid, "/v1/legacy/vault/trustees/" + team.trustees.get(1).id()).andExpect(status().isConflict());
        // a revoked trustee's token stops working immediately
        tGet(team.trustees.get(0).token(), "/v1/legacy/trustee/me").andExpect(status().isUnauthorized());
    }

    @Test
    void keyRotationWipesSharesAndDisarms() throws Exception {
        Team team = setupTeam(uniqueUid("rotate"), 2, 2, true);
        var enc = ClientCrypto.encryptVault(ClientCrypto.newVaultKey(RND), "v2".getBytes(), RND);
        oPut(team.uid, "/v1/legacy/vault", Map.of("ciphertext", enc.ciphertextB64(), "metadata", enc.metadata(),
                "keyRotated", true)).andExpect(status().isOk()).andExpect(jsonPath("$.vaultVersion").value(2))
                .andExpect(jsonPath("$.armed").value(false));
        oGet(team.uid, "/v1/legacy/vault/trustees").andExpect(jsonPath("$[0].shareUploaded").value(false))
                .andExpect(jsonPath("$[0].status").value("ACCEPTED"));
        oPost(team.uid, "/v1/legacy/vault/arm", null).andExpect(status().isConflict());
        tGet(team.trustees.get(0).token(), "/v1/legacy/trustee/me").andExpect(jsonPath("$.shareUploaded").value(false));
    }

    // ---- isolation ----------------------------------------------------------------------------------------

    @Test
    void userBCannotSeeOrTouchUserAsData() throws Exception {
        Team a = setupTeam(uniqueUid("alice"), 2, 2, true);
        String bob = uniqueUid("bob");

        // Bob has no vault: nothing of Alice's leaks through any owner endpoint
        for (String path : List.of("/v1/legacy/vault", "/v1/legacy/vault/state", "/v1/legacy/vault/ciphertext",
                "/v1/legacy/vault/trustees", "/v1/legacy/vault/timeline", "/v1/legacy/vault/audit/verify")) {
            oGet(bob, path).andExpect(status().isNotFound());
        }
        oPost(bob, "/v1/legacy/vault/checkin", null).andExpect(status().isNotFound());
        oPost(bob, "/v1/legacy/vault/arm", null).andExpect(status().isNotFound());

        // Bob with his own vault still cannot address Alice's trustees by id
        oPost(bob, "/v1/legacy/vault", vaultBody()).andExpect(status().isCreated());
        UUID aliceTrustee = a.trustees.get(0).id();
        oDelete(bob, "/v1/legacy/vault/trustees/" + aliceTrustee).andExpect(status().isNotFound());
        oPut(bob, "/v1/legacy/vault/trustees/" + aliceTrustee + "/share", Map.of("sealedShare",
                ClientCrypto.sealShare(new byte[40], "X25519", a.trustees.get(0).keys().spki(), a.vaultId, aliceTrustee, 1, RND),
                "vaultVersion", 1)).andExpect(status().isNotFound());
        oGet(bob, "/v1/legacy/vault/trustees").andExpect(jsonPath("$").isEmpty());
        oGet(bob, "/v1/legacy/vault/timeline").andExpect(jsonPath("$[*].detail.trusteeId").doesNotExist());

        // Alice's trustee token only ever shows Alice's vault; Bob's check-in does not move Alice's timer
        oPost(bob, "/v1/legacy/vault/checkin", null).andExpect(status().isOk());
        assertThat(state(a.uid)).isEqualTo("ACTIVE");
        oGet(a.uid, "/v1/legacy/vault/state").andExpect(jsonPath("$.lastCheckInAt").isNotEmpty());
        tGet(a.trustees.get(0).token(), "/v1/legacy/trustee/me").andExpect(status().isOk())
                .andExpect(jsonPath("$.vaultId").value(a.vaultId.toString()));
        // and Alice never sees Bob's trustees or events
        oGet(a.uid, "/v1/legacy/vault").andExpect(jsonPath("$.id").value(a.vaultId.toString()));
    }

    // ---- pause -----------------------------------------------------------------------------------------

    @Test
    void pauseHonoursPerPauseAndYearlyLimitsAndIsEndedByCheckIn() throws Exception {
        Team team = setupTeam(uniqueUid("pause"), 2, 2, true);
        oPost(team.uid, "/v1/legacy/vault/pause", Map.of("durationSeconds", 0)).andExpect(status().isBadRequest());
        oPost(team.uid, "/v1/legacy/vault/pause", Map.of("durationSeconds", 31 * D)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(containsString("exceeds the maximum")));
        oPost(team.uid, "/v1/legacy/vault/pause", Map.of("durationSeconds", 20 * D)).andExpect(status().isOk())
                .andExpect(jsonPath("$.pausedUntil").isNotEmpty()).andExpect(jsonPath("$.pause.usedSeconds").value(20 * D));
        oPost(team.uid, "/v1/legacy/vault/pause", Map.of("durationSeconds", D)).andExpect(status().isConflict());

        // a paused switch does not go overdue
        clock.advance(Duration.ofDays(10));
        tick();
        assertThat(state(team.uid)).isEqualTo("ACTIVE");
        // check-in ends the pause early and refunds the unused 10 days
        oPost(team.uid, "/v1/legacy/vault/checkin", null).andExpect(status().isOk())
                .andExpect(jsonPath("$.pausedUntil").doesNotExist()).andExpect(jsonPath("$.pause.usedSeconds").value(10 * D));

        // Only time actually spent paused counts against the 120-day yearly budget (10 days used so far):
        // three 29-day vacations fit (10+29+29+29 = 97), a fourth 30-day pause would reach 127 and is refused.
        int accepted = 0;
        for (int i = 0; i < 4; i++) {
            int st = oPost(team.uid, "/v1/legacy/vault/pause", Map.of("durationSeconds", 30 * D))
                    .andReturn().getResponse().getStatus();
            if (st == 409) {
                break;
            }
            assertThat(st).isEqualTo(200);
            accepted++;
            clock.advance(Duration.ofDays(29));
            tick();
            oPost(team.uid, "/v1/legacy/vault/resume", null).andExpect(status().isOk());
        }
        assertThat(accepted).isEqualTo(3);
        oPost(team.uid, "/v1/legacy/vault/pause", Map.of("durationSeconds", 30 * D)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(containsString("yearly")));
    }

    @Test
    void pauseOnlyWhenArmed() throws Exception {
        Team team = setupTeam(uniqueUid("pauseunarmed"), 1, 1, false);
        oPost(team.uid, "/v1/legacy/vault/pause", Map.of("durationSeconds", D)).andExpect(status().isConflict());
        oPost(team.uid, "/v1/legacy/vault/resume", null).andExpect(status().isConflict());
    }

    // ---- trustee gates ----------------------------------------------------------------------------------

    @Test
    void trusteesCannotFetchOrVoteBeforeTheirTime() throws Exception {
        Team team = setupTeam(uniqueUid("gates"), 3, 2, true);
        Trustee t = team.trustees.get(0);
        tGet(t.token(), "/v1/legacy/trustee/share").andExpect(status().isConflict());
        tGet(t.token(), "/v1/legacy/trustee/ciphertext").andExpect(status().isConflict());
        tPost(t.token(), "/v1/legacy/trustee/approval", Map.of("decision", "APPROVE")).andExpect(status().isConflict());
        tPost(t.token(), "/v1/legacy/trustee/approval", Map.of("decision", "MAYBE")).andExpect(status().isBadRequest());

        // trustees only see a coarse phase, not that the owner went quiet
        fireNextTimer(team.uid); // -> GRACE
        assertThat(state(team.uid)).isEqualTo("GRACE");
        tGet(t.token(), "/v1/legacy/trustee/me").andExpect(jsonPath("$.phase").value("WAITING"));
        fireNextTimer(team.uid); // -> ESCALATING
        tGet(t.token(), "/v1/legacy/trustee/me").andExpect(jsonPath("$.phase").value("WAITING"));
        tGet(t.token(), "/v1/legacy/trustee/share").andExpect(status().isConflict());
        tPost(t.token(), "/v1/legacy/trustee/approval", Map.of("decision", "APPROVE")).andExpect(status().isConflict());
        driveToReleasePending(team);
        tGet(t.token(), "/v1/legacy/trustee/me").andExpect(jsonPath("$.phase").value("VOTING"));
        // still nothing to fetch while merely pending, even with quorum approval
        vote(t, "APPROVE");
        vote(team.trustees.get(1), "APPROVE");
        tGet(t.token(), "/v1/legacy/trustee/share").andExpect(status().isConflict());
        tGet(t.token(), "/v1/legacy/trustee/ciphertext").andExpect(status().isConflict());
    }

    @Test
    void receiptConfirmationNeedsTheRightDigest() throws Exception {
        String uid = uniqueUid("confirm");
        Team team = setupTeam(uid, 1, 1, false);
        Trustee t = team.trustees.get(0);
        Map<String, Object> sealed = ClientCrypto.sealShare(new byte[40], "X25519", t.keys().spki(), team.vaultId, t.id(), 1, RND);
        oPut(uid, "/v1/legacy/vault/trustees/" + t.id() + "/share", Map.of("sealedShare", sealed, "vaultVersion", 1))
                .andExpect(status().isOk());
        tPost(t.token(), "/v1/legacy/trustee/share/confirm", Map.of("shareDigest", "00".repeat(32))).andExpect(status().isConflict());
        String digest = read(tGet(t.token(), "/v1/legacy/trustee/me"), "$.shareDigest");
        tPost(t.token(), "/v1/legacy/trustee/share/confirm", Map.of("shareDigest", digest)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"));
    }

    // ---- audit -----------------------------------------------------------------------------------------

    @Test
    void everyStateChangingActionIsAuditedAndTheChainVerifies() throws Exception {
        Team team = setupTeam(uniqueUid("audit"), 2, 2, true);
        oPost(team.uid, "/v1/legacy/vault/checkin", null).andExpect(status().isOk());
        fireNextTimer(team.uid);
        oPost(team.uid, "/v1/legacy/vault/checkin", null).andExpect(status().isOk());
        String timeline = body(oGet(team.uid, "/v1/legacy/vault/timeline?limit=500"));
        List<String> types = JsonPath.read(timeline, "$[*].eventType");
        assertThat(types).contains("VAULT_CREATED", "POLICY_SET", "TRUSTEE_INVITED", "TRUSTEE_ACCEPTED",
                "SHARE_UPLOADED", "SHARE_CONFIRMED", "ARMED", "CHECK_IN", "STATE_CHANGED");
        oGet(team.uid, "/v1/legacy/vault/audit/verify").andExpect(status().isOk())
                .andExpect(jsonPath("$.intact").value(true))
                .andExpect(jsonPath("$.length").value(types.size()));
        // nothing secret in any audit detail: no share, token or ciphertext
        String all = (String) dsl.fetchValue("select string_agg(detail::text, ' ') from legacy.audit_log where vault_id = ?", team.vaultId);
        for (Trustee t : team.trustees) {
            assertThat(all).doesNotContain(t.token());
        }
    }
}
