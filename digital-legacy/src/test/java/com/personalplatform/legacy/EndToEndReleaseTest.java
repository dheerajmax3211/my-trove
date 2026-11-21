package com.personalplatform.legacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.legacy.crypto.Shamir;
import com.personalplatform.legacy.protocol.Urgency;
import com.personalplatform.legacy.support.ClientCrypto;
import com.personalplatform.legacy.support.LegacyIntegrationBase;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.slf4j.LoggerFactory;

/**
 * The whole product, with the test playing every client: the owner encrypts a secret and splits the key, silence
 * drives the protocol under a fake clock, trustees approve, two of three recover the plaintext, one cannot - and the
 * server's database and logs never contain anything that would let it do the same.
 */
class EndToEndReleaseTest extends LegacyIntegrationBase {

    @Test
    void ownerGoesSilentTrusteesApproveAndTwoOfThreeRecoverTheSecret() throws Exception {
        // capture every log line (including jOOQ's DEBUG SQL with bind values) for the whole scenario
        ch.qos.logback.classic.Logger root = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        ch.qos.logback.classic.Logger sqlLog =
                (ch.qos.logback.classic.Logger) LoggerFactory.getLogger("org.jooq.tools.LoggerListener");
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        root.addAppender(logs);
        Level before = sqlLog.getLevel();
        sqlLog.setLevel(Level.DEBUG);
        try {
            scenario(logs);
        } finally {
            sqlLog.setLevel(before);
            root.detachAppender(logs);
        }
    }

    private void scenario(ListAppender<ILoggingEvent> output) throws Exception {
        String uid = uniqueUid("e2e-owner");
        Team team = setupTeam(uid, 3, 2, true);
        Instant armedAt = clock.instant();
        String plaintext = new String(team.plaintext, StandardCharsets.UTF_8);

        // --- the owner is alive for a while: a check-in pushes the deadline out
        clock.set(armedAt.plusSeconds(3 * D));
        tick();
        oPost(uid, "/v1/legacy/vault/checkin", null).andExpect(status().isOk())
                .andExpect(jsonPath("$.nextDueAt").value(armedAt.plusSeconds(10 * D).toString()));
        assertThat(channels.sentFor(team.vaultId)).isEmpty();

        // --- then silence: the protocol walks ACTIVE -> GRACE -> ESCALATING -> RELEASE_PENDING
        List<String> seen = new ArrayList<>();
        for (int i = 0; i < 12 && !"RELEASE_PENDING".equals(state(uid)); i++) {
            fireNextTimer(uid);
            String st = state(uid);
            if (seen.isEmpty() || !seen.get(seen.size() - 1).equals(st)) {
                seen.add(st);
            }
        }
        assertThat(seen).containsExactly("GRACE", "ESCALATING", "RELEASE_PENDING");
        assertThat(channels.sentFor(team.vaultId).stream().map(s -> s.message().urgency()).distinct().toList())
                .containsExactly(Urgency.NOTICE, Urgency.WARNING, Urgency.URGENT, Urgency.FINAL);

        // --- nothing can be fetched yet, one approval is not enough
        Trustee t0 = team.trustees.get(0);
        Trustee t1 = team.trustees.get(1);
        Trustee t2 = team.trustees.get(2);
        tGet(t0.token(), "/v1/legacy/trustee/share").andExpect(status().isConflict());
        vote(t0, "APPROVE");
        clock.advance(java.time.Duration.ofDays(30));
        tick();
        assertThat(state(uid)).isEqualTo("RELEASE_PENDING");

        // --- the second approval reaches quorum; release waits out the cool-off
        vote(t1, "APPROVE");
        Instant quorumAt = clock.instant();
        clock.set(quorumAt.plusSeconds(2 * D - 1));
        tick();
        assertThat(state(uid)).isEqualTo("RELEASE_PENDING");
        tGet(t1.token(), "/v1/legacy/trustee/ciphertext").andExpect(status().isConflict());
        clock.set(quorumAt.plusSeconds(2 * D));
        tick();
        assertThat(state(uid)).isEqualTo("RELEASED");

        // --- two trustees fetch (each fetch audited), open their shares with their own private keys
        Map<String, Object> env0 = JsonPath.read(body(ok(tGet(t0.token(), "/v1/legacy/trustee/share"))), "$.sealedShare");
        Map<String, Object> env1 = JsonPath.read(body(ok(tGet(t1.token(), "/v1/legacy/trustee/share"))), "$.sealedShare");
        String ctBody = body(ok(tGet(t0.token(), "/v1/legacy/trustee/ciphertext")));
        ok(tGet(t1.token(), "/v1/legacy/trustee/ciphertext"));
        String ciphertext = JsonPath.read(ctBody, "$.ciphertext");
        Map<String, Object> metadata = JsonPath.read(ctBody, "$.metadata");

        byte[] share0 = ClientCrypto.openShare(env0, t0.keys(), team.vaultId, t0.id(), 1);
        byte[] share1 = ClientCrypto.openShare(env1, t1.keys(), team.vaultId, t1.id(), 1);
        byte[] key = Shamir.combine(List.of(Shamir.Share.decode(share0), Shamir.Share.decode(share1)));
        assertThat(key).isEqualTo(team.vaultKey);
        assertThat(ClientCrypto.decryptVault(key, ciphertext, metadata)).isEqualTo(team.plaintext);

        // --- one trustee alone cannot: not enough shares, and a share is useless to anyone but its owner
        assertThatThrownBy(() -> Shamir.combine(List.of(Shamir.Share.decode(share0)))).hasMessageContaining("need 2");
        assertThatThrownBy(() -> ClientCrypto.decryptVault(share0Padded(share0), ciphertext, metadata))
                .isInstanceOf(GeneralSecurityException.class);
        assertThatThrownBy(() -> ClientCrypto.openShare(env1, t0.keys(), team.vaultId, t1.id(), 1))
                .as("trustee 0 cannot open trustee 1's envelope").isInstanceOf(Exception.class);
        assertThatThrownBy(() -> ClientCrypto.openShare(env0, t0.keys(), team.vaultId, t1.id(), 1))
                .as("an envelope is bound to its trustee id").isInstanceOf(GeneralSecurityException.class);
        // the trustee API never hands one trustee another's share
        Map<String, Object> again = JsonPath.read(body(ok(tGet(t2.token(), "/v1/legacy/trustee/share"))), "$.sealedShare");
        assertThat(again).isNotEqualTo(env0).isNotEqualTo(env1);

        // --- audited: every fetch, and the chain still verifies
        List<String> types = JsonPath.read(body(oGet(uid, "/v1/legacy/vault/timeline?limit=500")), "$[*].eventType");
        assertThat(types.stream().filter("SHARE_FETCHED"::equals).count()).isEqualTo(3);
        assertThat(types.stream().filter("CIPHERTEXT_FETCHED"::equals).count()).isEqualTo(2);
        assertThat(types).contains("RELEASED", "QUORUM_REACHED", "APPROVAL_CAST");
        oGet(uid, "/v1/legacy/vault/audit/verify").andExpect(jsonPath("$.intact").value(true));
        oPost(uid, "/v1/legacy/vault/checkin", null).andExpect(status().isConflict());

        // --- the server never held anything that could open the vault
        assertServerNeverSawSecrets(team, plaintext, output);
    }

    private static byte[] share0Padded(byte[] share) {
        byte[] k = new byte[32];
        System.arraycopy(share, 0, k, 0, Math.min(32, share.length)); // a single share is not the key
        return k;
    }

    private void assertServerNeverSawSecrets(Team team, String plaintext, ListAppender<ILoggingEvent> output) {
        List<String> needles = new ArrayList<>();
        needles.add(plaintext);
        needles.add("safe code 31-41-59");
        needles.add(Base64.getEncoder().encodeToString(team.plaintext));
        needles.add(HexFormat.of().formatHex(team.plaintext));
        needles.add(Base64.getEncoder().encodeToString(team.vaultKey));
        needles.add(Base64.getUrlEncoder().withoutPadding().encodeToString(team.vaultKey));
        needles.add(HexFormat.of().formatHex(team.vaultKey));
        for (byte[] share : team.shares) {
            needles.add(Base64.getEncoder().encodeToString(share));
            needles.add(HexFormat.of().formatHex(share));
        }
        for (Trustee t : team.trustees) {
            needles.add(t.token());
        }

        // every column of every table of the legacy schema, as text (bytea as hex), plus raw ciphertext bytes
        List<String> tables = dsl.fetch("select table_name from information_schema.tables where table_schema = 'legacy'"
                        + " and table_name <> 'flyway_schema_history'").getValues(0, String.class);
        assertThat(tables).contains("vaults", "trustees", "audit_log", "approvals", "notification_outbox");
        StringBuilder dump = new StringBuilder();
        for (String table : tables) {
            dsl.fetch("select t::text from legacy." + table + " t").forEach(r -> dump.append(r.get(0)).append('\n'));
        }
        // invite tokens are not recoverable from the DB either (only digests are stored); checked by the next line
        String dbText = dump.toString();
        byte[] rawCiphertext = dsl.fetchOne("select ciphertext from legacy.vaults where id = ?", team.vaultId)
                .get(0, byte[].class);
        String rawAsLatin1 = new String(rawCiphertext, StandardCharsets.ISO_8859_1);
        StringBuilder logBuf = new StringBuilder();
        for (ILoggingEvent e : new ArrayList<>(output.list)) {
            logBuf.append(e.getFormattedMessage()).append('\n');
            if (e.getThrowableProxy() != null) {
                logBuf.append(e.getThrowableProxy().getMessage()).append('\n');
            }
        }
        String logs = logBuf.toString();
        for (String needle : needles) {
            assertThat(dbText).as("database text must not contain a secret").doesNotContain(needle);
            assertThat(rawAsLatin1).as("ciphertext must not contain plaintext").doesNotContain(needle);
            assertThat(logs).as("logs must not contain a secret").doesNotContain(needle);
        }
        // sanity: the search actually looks at the data (the ciphertext hex is in the dump, the trustee labels too)
        assertThat(dbText).contains(HexFormat.of().formatHex(rawCiphertext).substring(0, 32));
        assertThat(dbText).contains("Trustee 0");
        assertThat(logs).as("the log capture works: jOOQ SQL was logged").contains("insert into \"legacy\".\"vaults\"");
    }
}
