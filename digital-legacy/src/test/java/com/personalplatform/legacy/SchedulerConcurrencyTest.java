package com.personalplatform.legacy;

import static com.personalplatform.sql.jooq.legacy.legacy.Tables.ESCALATION_STEPS;
import static com.personalplatform.sql.jooq.legacy.legacy.Tables.NOTIFICATION_OUTBOX;
import static com.personalplatform.sql.jooq.legacy.legacy.Tables.VAULTS;
import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.legacy.support.LegacyIntegrationBase;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

/** Several scheduler instances against one database must never double-process a vault or double-escalate a step. */
class SchedulerConcurrencyTest extends LegacyIntegrationBase {

    @Autowired TransactionTemplate tx;

    @Test
    void aVaultLockedByAnotherInstanceIsSkippedNotWaitedFor() throws Exception {
        Team team = setupTeam(uniqueUid("skiplocked"), 2, 2, true);
        clock.set(clock.instant().plusSeconds(7 * D));
        ExecutorService pool = Executors.newSingleThreadExecutor();
        try {
            CountDownLatch locked = new CountDownLatch(1);
            CountDownLatch release = new CountDownLatch(1);
            // "instance A" holds the vault's row lock mid-processing
            Future<?> holder = pool.submit(() -> tx.executeWithoutResult(s -> {
                dsl.select(VAULTS.ID).from(VAULTS).where(VAULTS.ID.eq(team.vaultId)).forUpdate().fetch();
                locked.countDown();
                try {
                    release.await(30, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }));
            assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();
            // "instance B" ticks meanwhile: it must return promptly and leave the vault alone
            CompletableFuture<Integer> other = CompletableFuture.supplyAsync(engine::tick);
            other.get(20, TimeUnit.SECONDS); // would hang for 30s (and fail) if it waited on the lock
            assertThat(JsonStateOf(team)).isEqualTo("ACTIVE");
            release.countDown();
            holder.get(10, TimeUnit.SECONDS);
            // once the lock is gone the vault is claimed exactly once
            engine.tick();
            assertThat(JsonStateOf(team)).isEqualTo("GRACE");
            assertThat(engine.tick()).isGreaterThanOrEqualTo(0);
            assertThat(JsonStateOf(team)).isEqualTo("GRACE");
            assertThat(auditCount(team.vaultId, "STATE_CHANGED")).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    private String JsonStateOf(Team team) {
        return dsl.select(VAULTS.STATE).from(VAULTS).where(VAULTS.ID.eq(team.vaultId)).fetchOne(VAULTS.STATE);
    }

    private int auditCount(UUID vaultId, String type) {
        return ((Number) dsl.fetchValue("select count(*) from legacy.audit_log where vault_id = ? and event_type = ?",
                vaultId, type)).intValue();
    }

    @Test
    void manyInstancesTickingTogetherNeverDoubleEscalate() throws Exception {
        int vaults = 8;
        int instances = 4;
        List<Team> teams = new ArrayList<>();
        for (int i = 0; i < vaults; i++) {
            teams.add(setupTeam(uniqueUid("herd" + i), 2, 2, true));
        }
        ExecutorService pool = Executors.newFixedThreadPool(instances);
        try {
            // fire every durable timer in turn, each time with all instances racing
            for (int stage = 0; stage < 8; stage++) {
                Instant next = teams.stream().map(t -> dsl.select(VAULTS.NEXT_ACTION_AT).from(VAULTS)
                                .where(VAULTS.ID.eq(t.vaultId)).fetchOne(VAULTS.NEXT_ACTION_AT))
                        .filter(java.util.Objects::nonNull).map(o -> o.toInstant()).min(Instant::compareTo)
                        .orElse(null);
                if (next == null) {
                    break;
                }
                clock.set(next);
                CyclicBarrier start = new CyclicBarrier(instances);
                List<Callable<Integer>> jobs = new ArrayList<>();
                for (int i = 0; i < instances; i++) {
                    jobs.add(() -> {
                        start.await();
                        int n = engine.tick();
                        dispatcher.dispatchPending(1000);
                        return n;
                    });
                }
                for (Future<Integer> f : pool.invokeAll(jobs)) {
                    f.get(60, TimeUnit.SECONDS);
                }
            }
        } finally {
            pool.shutdownNow();
        }
        for (Team t : teams) {
            assertThat(JsonStateOf(t)).isEqualTo("RELEASE_PENDING");
            // 3 escalation steps, recorded once each
            assertThat(dsl.fetchCount(ESCALATION_STEPS, ESCALATION_STEPS.VAULT_ID.eq(t.vaultId))).isEqualTo(3);
            assertThat(auditCount(t.vaultId, "ESCALATION_STEP_EXECUTED")).isEqualTo(3);
            // ACTIVE->GRACE->ESCALATING->RELEASE_PENDING: three transitions, each exactly once
            assertThat(auditCount(t.vaultId, "STATE_CHANGED")).isEqualTo(3);
            // every outbox row delivered exactly once, nothing duplicated by racing dispatchers
            int rows = dsl.fetchCount(NOTIFICATION_OUTBOX, NOTIFICATION_OUTBOX.VAULT_ID.eq(t.vaultId));
            int sentRows = dsl.fetchCount(NOTIFICATION_OUTBOX,
                    NOTIFICATION_OUTBOX.VAULT_ID.eq(t.vaultId).and(NOTIFICATION_OUTBOX.STATUS.eq("SENT")));
            assertThat(sentRows).isEqualTo(rows);
            assertThat(channels.sentFor(t.vaultId)).hasSize(rows);
            // grace notice (1) + 3 escalation pings (owner; owner+2; owner+2 = 1+3+3) + pending (owner + 2)
            assertThat(rows).isEqualTo(1 + 1 + 3 + 3 + 3);
        }
    }
}
