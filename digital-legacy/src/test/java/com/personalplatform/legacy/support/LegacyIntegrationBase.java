package com.personalplatform.legacy.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.legacy.crypto.Shamir;
import com.personalplatform.legacy.notify.NotificationDispatcher;
import com.personalplatform.legacy.scheduler.SwitchEngine;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jooq.DSLContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.ObjectMapper;

/**
 * Shared setup for integration tests: real Postgres, fake clock, recording notification channels, and helpers that
 * play the owner's and trustees' clients through the HTTP API. All subclasses share ONE Spring context (and DB).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestInfrastructure.class)
@TestPropertySource(properties = {
    "legacy.scheduler.enabled=false",
    "logging.level.com.personalplatform.legacy=DEBUG"
})
@ExtendWith(OutputCaptureExtension.class)
public abstract class LegacyIntegrationBase {

    protected static final SecureRandom RND = new SecureRandom();
    protected static final long H = 3600;
    protected static final long D = 86400;

    @Autowired protected MockMvc mvc;
    @Autowired protected MutableClock clock;
    @Autowired protected SwitchEngine engine;
    @Autowired protected NotificationDispatcher dispatcher;
    @Autowired protected RecordingChannels channels;
    @Autowired protected DSLContext dsl;
    @Autowired protected ObjectMapper mapper;

    @BeforeEach
    void resetClockAndChannels() {
        clock.set(TestInfrastructure.START);
        channels.healAll();
    }

    // ---- scheduler -------------------------------------------------------------------------------------

    /** One scheduler pass: advance due vaults, then deliver pending notifications. */
    protected int tick() {
        int n = engine.tick();
        dispatcher.dispatchPending(1000);
        return n;
    }

    /** Moves the clock to the vault's durable timer and runs the scheduler, like a real timer firing. */
    protected void fireNextTimer(String uid) throws Exception {
        String next = JsonPath.read(body(oGet(uid, "/v1/legacy/vault/state")), "$.nextActionAt");
        clock.set(Instant.parse(next));
        tick();
    }

    // ---- HTTP helpers ----------------------------------------------------------------------------------

    protected static String bearer(String uid) {
        return "Bearer " + Base64.getUrlEncoder().withoutPadding().encodeToString(uid.getBytes(StandardCharsets.UTF_8));
    }

    protected ResultActions oGet(String uid, String path) throws Exception {
        return mvc.perform(get(path).header("Authorization", bearer(uid)));
    }

    protected ResultActions oPost(String uid, String path, Object body) throws Exception {
        return mvc.perform(withBody(post(path), body).header("Authorization", bearer(uid)));
    }

    protected ResultActions oPut(String uid, String path, Object body) throws Exception {
        return mvc.perform(withBody(put(path), body).header("Authorization", bearer(uid)));
    }

    protected ResultActions oDelete(String uid, String path) throws Exception {
        return mvc.perform(delete(path).header("Authorization", bearer(uid)));
    }

    protected ResultActions tGet(String token, String path) throws Exception {
        return mvc.perform(get(path).header("Authorization", "Trustee " + token));
    }

    protected ResultActions tPost(String token, String path, Object body) throws Exception {
        return mvc.perform(withBody(post(path), body).header("Authorization", "Trustee " + token));
    }

    private MockHttpServletRequestBuilder withBody(MockHttpServletRequestBuilder b, Object body) {
        return b.contentType(MediaType.APPLICATION_JSON).content(body == null ? "" : mapper.writeValueAsString(body));
    }

    protected static ResultActions ok(ResultActions r) throws Exception {
        return r.andExpect(status().is2xxSuccessful());
    }

    protected String body(ResultActions r) throws Exception {
        return r.andReturn().getResponse().getContentAsString();
    }

    protected <T> T read(ResultActions r, String path) throws Exception {
        return JsonPath.read(body(ok(r)), path);
    }

    protected String state(String uid) throws Exception {
        return read(oGet(uid, "/v1/legacy/vault/state"), "$.state");
    }

    // ---- fixture ---------------------------------------------------------------------------------------

    public record Trustee(UUID id, String token, ClientCrypto.TrusteeKeys keys) {}

    public static final class Team {
        public String uid;
        public UUID vaultId;
        public byte[] vaultKey;
        public byte[] plaintext;
        public int quorum;
        public final List<Trustee> trustees = new ArrayList<>();
        /** Plaintext Shamir shares, known only to this test (the "client"). */
        public final List<byte[]> shares = new ArrayList<>();
    }

    protected static String uniqueUid(String prefix) {
        return prefix + "-" + UUID.randomUUID();
    }

    protected static Map<String, Object> policy(int quorum) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("checkInIntervalSeconds", 7 * D);
        p.put("graceSeconds", 2 * D);
        p.put("escalationDurationSeconds", 3 * D);
        p.put("steps", List.of(
                step(0, "NOTICE", "OWNER", List.of("PUSH", "EMAIL")),
                step(D, "WARNING", "ALL", List.of("EMAIL", "SMS")),
                step(2 * D, "URGENT", "ALL", List.of("SMS", "EMAIL"))));
        p.put("coolOffSeconds", 2 * D);
        p.put("quorum", quorum);
        p.put("maxPauseSeconds", 30 * D);
        p.put("ownerContacts", List.of(Map.of("channel", "PUSH", "address", "push-token-123456"),
                Map.of("channel", "EMAIL", "address", "owner@example.com")));
        return p;
    }

    protected static Map<String, Object> step(long offset, String urgency, String audience, List<String> channels) {
        return Map.of("offsetSeconds", offset, "urgency", urgency, "audience", audience, "channels", channels);
    }

    /**
     * Plays the owner's and trustees' clients: encrypts a secret, creates the vault, invites and registers
     * {@code n} trustees (alternating X25519 / RSA keys), Shamir-splits the vault key t-of-n, seals each share to
     * its trustee's public key, uploads and confirms them, sets the policy and optionally arms.
     */
    protected Team setupTeam(String uid, int n, int t, boolean arm) throws Exception {
        Team team = new Team();
        team.uid = uid;
        team.quorum = t;
        team.vaultKey = ClientCrypto.newVaultKey(RND);
        team.plaintext = ("TOP-SECRET-LEGACY-" + UUID.randomUUID() + ": bank=Example Bank, safe code 31-41-59")
                .getBytes(StandardCharsets.UTF_8);
        var enc = ClientCrypto.encryptVault(team.vaultKey, team.plaintext, RND);
        team.vaultId = UUID.fromString(read(
                oPost(uid, "/v1/legacy/vault", Map.of("ciphertext", enc.ciphertextB64(), "metadata", enc.metadata())),
                "$.id"));
        ok(oPut(uid, "/v1/legacy/vault/policy", policy(t)));
        for (int i = 0; i < n; i++) {
            var invite = oPost(uid, "/v1/legacy/vault/trustees", Map.of("label", "Trustee " + i));
            String inviteBody = body(invite.andExpect(status().isCreated()));
            UUID trusteeId = UUID.fromString(JsonPath.read(inviteBody, "$.trusteeId"));
            String inviteToken = JsonPath.read(inviteBody, "$.inviteToken");
            var keys = i % 2 == 0 ? ClientCrypto.generateX25519() : ClientCrypto.generateRsa();
            String accepted = body(mvc.perform(post("/v1/legacy/trustee/accept")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(mapper.writeValueAsString(Map.of(
                            "inviteToken", inviteToken,
                            "keyAlgorithm", keys.algorithm(),
                            "publicKey", keys.publicKeyB64(),
                            "contacts", List.of(Map.of("channel", "EMAIL", "address", "trustee" + i + "@example.com"),
                                    Map.of("channel", "SMS", "address", "+1555000100" + i))))))
                    .andExpect(status().isCreated()));
            team.trustees.add(new Trustee(trusteeId, JsonPath.read(accepted, "$.accessToken"), keys));
        }
        if (n > 0) {
            List<Shamir.Share> shares = new Shamir(RND).split(team.vaultKey, n, t);
            for (int i = 0; i < n; i++) {
                team.shares.add(shares.get(i).encode());
                Trustee tr = team.trustees.get(i);
                var sealed = ClientCrypto.sealShare(shares.get(i).encode(), tr.keys().algorithm(), tr.keys().spki(),
                        team.vaultId, tr.id(), 1, RND);
                ok(oPut(uid, "/v1/legacy/vault/trustees/" + tr.id() + "/share",
                        Map.of("sealedShare", sealed, "vaultVersion", 1)));
                String digest = read(tGet(tr.token(), "/v1/legacy/trustee/me"), "$.shareDigest");
                ok(tPost(tr.token(), "/v1/legacy/trustee/share/confirm", Map.of("shareDigest", digest)));
            }
        }
        if (arm) {
            ok(oPost(uid, "/v1/legacy/vault/arm", null));
        }
        return team;
    }

    /** Drives a freshly armed vault into RELEASE_PENDING by firing its timers one after another. */
    protected void driveToReleasePending(Team team) throws Exception {
        for (int i = 0; i < 20 && !"RELEASE_PENDING".equals(state(team.uid)); i++) {
            fireNextTimer(team.uid);
        }
    }

    protected void vote(Trustee t, String decision) throws Exception {
        ok(tPost(t.token(), "/v1/legacy/trustee/approval", Map.of("decision", decision)));
    }
}
