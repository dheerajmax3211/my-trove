package com.personalplatform.shared;

import static com.personalplatform.sql.jooq.shared.shared.Tables.NOTIFICATIONS;
import static com.personalplatform.sql.jooq.shared.shared.Tables.REMINDERS;
import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.notify.ContactDirectory;
import com.personalplatform.notify.NotificationRelay;
import com.personalplatform.shared.reminder.Recurrence;
import com.personalplatform.shared.reminder.Recurrence.Unit;
import com.personalplatform.shared.reminder.ReminderEngine;
import com.personalplatform.shared.reminder.ReminderService;
import com.personalplatform.sql.UuidV7;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

/** Scheduler, recurrence and outbox behaviour against real Postgres. */
class ReminderEngineTests extends AbstractIntegrationTest {

    @Autowired ReminderService reminders;
    @Autowired ContactDirectory contacts;

    private ReminderEngine newInstance(int batchSize, java.util.function.Consumer<List<UUID>> hook) {
        return new ReminderEngine(dsl, new TransactionTemplate(txManager), clock, batchSize, hook);
    }

    private NotificationRelay newRelay(int maxAttempts) {
        return new NotificationRelay(dsl, new TransactionTemplate(txManager), clock, sender, contacts, maxAttempts,
                Duration.ofSeconds(30), Duration.ofHours(1));
    }

    /** Every test user has an address on file, as a real user would after signing in. */
    private void onFile(String uid) {
        contacts.remember(uid, uid + "@example.test");
    }

    private UUID personal(String uid, String title, Instant due, Recurrence rec) {
        onFile(uid);
        return reminders.create(uid, title, due, rec, null).id();
    }

    private long notificationCount(UUID reminderId) {
        return dsl.fetchCount(NOTIFICATIONS, NOTIFICATIONS.REMINDER_ID.eq(reminderId));
    }

    // ---- claiming -----------------------------------------------------------------------------------------

    @Test
    void oneShotReminderFiresOnceThenCompletes() {
        UUID id = personal(uid("a"), "once", TestBeans.T0.plusSeconds(60), null);
        ReminderEngine engine = newInstance(10, ids -> {});

        assertThat(engine.fireDue()).isEmpty(); // not due yet
        clock.advance(Duration.ofSeconds(61));
        assertThat(engine.fireDue()).containsExactly(id);
        assertThat(engine.fireDue()).isEmpty();
        clock.advance(Duration.ofDays(3));
        assertThat(engine.fireDue()).isEmpty();

        assertThat(notificationCount(id)).isEqualTo(1);
        assertThat(dsl.select(REMINDERS.STATUS).from(REMINDERS).where(REMINDERS.ID.eq(id)).fetchOne(REMINDERS.STATUS))
                .isEqualTo("COMPLETED");
    }

    @Test
    void cancelledRemindersNeverFire() {
        String alice = uid("a");
        UUID id = personal(alice, "nope", TestBeans.T0, null);
        reminders.cancel(alice, id);
        clock.advance(Duration.ofHours(1));
        assertThat(newInstance(10, ids -> {}).fireDue()).isEmpty();
        assertThat(notificationCount(id)).isZero();
    }

    @Test
    void twoInstancesNeverClaimTheSameReminderWhileOneHoldsTheLocks() throws Exception {
        String alice = uid("a");
        List<UUID> all = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            all.add(personal(alice, "r" + i, TestBeans.T0.plusSeconds(i), null));
        }
        clock.advance(Duration.ofMinutes(1));

        CountDownLatch aHoldsLocks = new CountDownLatch(1);
        CountDownLatch releaseA = new CountDownLatch(1);
        ReminderEngine a = newInstance(4, ids -> {
            aHoldsLocks.countDown();
            try {
                if (!releaseA.await(30, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("test timed out");
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        ReminderEngine b = newInstance(10, ids -> {});

        ExecutorService pool = Executors.newSingleThreadExecutor();
        try {
            Future<List<UUID>> aResult = pool.submit(a::fireDue);
            assertThat(aHoldsLocks.await(30, TimeUnit.SECONDS)).isTrue();

            // A has locked its 4 earliest rows and has NOT committed. B must not wait and must not take them.
            List<UUID> bResult = b.fireDue();
            releaseA.countDown();
            List<UUID> aIds = aResult.get(30, TimeUnit.SECONDS);

            assertThat(aIds).hasSize(4).containsExactlyElementsOf(all.subList(0, 4));
            assertThat(bResult).hasSize(6).containsExactlyElementsOf(all.subList(4, 10));
            assertThat(new HashSet<>(aIds)).doesNotContainAnyElementsOf(bResult);
        } finally {
            releaseA.countDown();
            pool.shutdownNow();
        }
        for (UUID id : all) {
            assertThat(notificationCount(id)).as("notifications for %s", id).isEqualTo(1);
        }
    }

    @Test
    void manyInstancesRacingProcessEveryReminderExactlyOnce() throws Exception {
        String alice = uid("a");
        int total = 120;
        Set<UUID> expected = new HashSet<>();
        for (int i = 0; i < total; i++) {
            expected.add(personal(alice, "r" + i, TestBeans.T0, i % 3 == 0 ? new Recurrence(Unit.DAILY, 1) : null));
        }
        clock.advance(Duration.ofMinutes(1));

        int instances = 4;
        ExecutorService pool = Executors.newFixedThreadPool(instances);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<List<UUID>>> futures = new ArrayList<>();
            for (int i = 0; i < instances; i++) {
                ReminderEngine engine = newInstance(7, ids -> {});
                futures.add(pool.submit(() -> {
                    start.await();
                    List<UUID> mine = new ArrayList<>();
                    List<UUID> batch;
                    do {
                        batch = engine.fireDue();
                        mine.addAll(batch);
                    } while (!batch.isEmpty());
                    return mine;
                }));
            }
            start.countDown();
            List<UUID> claimedByAnyone = new ArrayList<>();
            for (Future<List<UUID>> f : futures) {
                claimedByAnyone.addAll(f.get(60, TimeUnit.SECONDS));
            }
            // no reminder claimed twice (a duplicate here would mean two instances processed the same row)
            assertThat(claimedByAnyone).hasSize(total).doesNotHaveDuplicates();
            assertThat(new HashSet<>(claimedByAnyone)).isEqualTo(expected);
        } finally {
            pool.shutdownNow();
        }
        assertThat(dsl.fetchCount(NOTIFICATIONS)).isEqualTo(total);
    }

    // ---- recurrence ---------------------------------------------------------------------------------------

    @Test
    void recurringReminderSchedulesExactlyOneNextOccurrenceInTheSameTransaction() {
        String alice = uid("a");
        Instant due = TestBeans.T0.plusSeconds(60);
        UUID id = personal(alice, "daily", due, new Recurrence(Unit.DAILY, 1));
        ReminderEngine engine = newInstance(10, ids -> {});

        clock.set(due.plusSeconds(5));
        assertThat(engine.fireDue()).containsExactly(id);

        var row = dsl.selectFrom(REMINDERS).where(REMINDERS.ID.eq(id)).fetchSingle();
        assertThat(row.getStatus()).isEqualTo("ACTIVE");
        assertThat(row.getDueAt().toInstant()).isEqualTo(due.plus(Duration.ofDays(1)));
        assertThat(dsl.fetchCount(REMINDERS, REMINDERS.OWNER_UID.eq(alice))).isEqualTo(1); // still ONE row, advanced
        assertThat(notificationCount(id)).isEqualTo(1);

        // firing again at the same instant must be a no-op (the next occurrence is tomorrow)
        assertThat(engine.fireDue()).isEmpty();
        assertThat(notificationCount(id)).isEqualTo(1);

        clock.set(due.plus(Duration.ofDays(1)));
        assertThat(engine.fireDue()).containsExactly(id);
        assertThat(notificationCount(id)).isEqualTo(2);
        assertThat(dsl.selectFrom(REMINDERS).where(REMINDERS.ID.eq(id)).fetchSingle().getDueAt().toInstant())
                .isEqualTo(due.plus(Duration.ofDays(2)));
    }

    @Test
    void recurrenceAdvanceAndFireCommitOrRollBackTogether() {
        String alice = uid("a");
        UUID id = personal(alice, "atomic", TestBeans.T0, new Recurrence(Unit.DAILY, 1));
        clock.advance(Duration.ofMinutes(1));
        ReminderEngine boom = newInstance(10, ids -> {
            throw new IllegalStateException("crash after claim");
        });
        try {
            boom.fireDue();
        } catch (IllegalStateException expected) {
            // swallowed: the transaction rolled back
        }
        assertThat(dsl.selectFrom(REMINDERS).where(REMINDERS.ID.eq(id)).fetchSingle().getDueAt().toInstant())
                .isEqualTo(TestBeans.T0);
        assertThat(notificationCount(id)).isZero();
        assertThat(newInstance(10, ids -> {}).fireDue()).containsExactly(id); // nothing lost, nothing doubled
    }

    @Test
    void downtimeSkipsMissedOccurrencesAndFiresOnce() {
        UUID id = personal(uid("a"), "weekly", TestBeans.T0, new Recurrence(Unit.WEEKLY, 1));
        clock.advance(Duration.ofDays(20));
        newInstance(10, ids -> {}).fireDue();
        assertThat(notificationCount(id)).isEqualTo(1);
        // anchor is T0 (Thu 15 Jan): 3 weeks later is the first aligned instant after "now" (+20d)
        assertThat(dsl.selectFrom(REMINDERS).where(REMINDERS.ID.eq(id)).fetchSingle().getDueAt().toInstant())
                .isEqualTo(TestBeans.T0.plus(Duration.ofDays(21)));
    }

    @Test
    void householdReminderFansOutToEveryMemberOnce() throws Exception {
        String alice = uid("alice"), bob = uid("bob");
        UUID h = createHousehold(alice, "Home");
        join(bob, h, alice);
        UUID id = reminders.create(alice, "bins", TestBeans.T0, null, h).id();
        clock.advance(Duration.ofMinutes(1));

        newInstance(10, ids -> {}).fireDue();
        assertThat(dsl.select(NOTIFICATIONS.RECIPIENT_UID).from(NOTIFICATIONS).where(NOTIFICATIONS.REMINDER_ID.eq(id))
                .fetch(NOTIFICATIONS.RECIPIENT_UID)).containsExactlyInAnyOrder(alice, bob);
        getAs(bob, "/v1/notifications").andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                .jsonPath("$[0].title").value("bins"));
    }

    // ---- outbox relay: retries and dead letter ------------------------------------------------------------

    private void insertDueNotification(UUID id, String recipient) {
        UUID reminderId = personal(recipient, "n", TestBeans.T0, null);
        dsl.insertInto(NOTIFICATIONS)
                .set(NOTIFICATIONS.ID, id)
                .set(NOTIFICATIONS.REMINDER_ID, reminderId)
                .set(NOTIFICATIONS.RECIPIENT_UID, recipient)
                .set(NOTIFICATIONS.TITLE, "n")
                .set(NOTIFICATIONS.OCCURRENCE_AT, com.personalplatform.shared.common.Times.odt(TestBeans.T0))
                .set(NOTIFICATIONS.NEXT_ATTEMPT_AT, com.personalplatform.shared.common.Times.odt(TestBeans.T0))
                .set(NOTIFICATIONS.CREATED_AT, com.personalplatform.shared.common.Times.odt(TestBeans.T0))
                .execute();
    }

    @Test
    void firedReminderIsDeliveredThroughTheOutbox() {
        String alice = uid("a");
        personal(alice, "deliver me", TestBeans.T0, null);
        clock.advance(Duration.ofSeconds(1));
        newInstance(10, ids -> {}).fireDue();

        assertThat(sender.delivered).isEmpty(); // nothing is sent inside the claiming transaction
        var result = newRelay(5).dispatchDue(10);
        assertThat(result.sent()).isEqualTo(1);
        assertThat(sender.delivered).singleElement().satisfies(m -> {
            assertThat(m.recipientUid()).isEqualTo(alice);
            assertThat(m.title()).isEqualTo("deliver me");
        });
        assertThat(newRelay(5).dispatchDue(10).total()).isZero(); // SENT rows are never re-sent
    }

    @Test
    void failedSendRetriesWithBackoffThenDeadLetters() {
        UUID nid = UuidV7.next();
        insertDueNotification(nid, uid("a"));
        sender.failWhen = m -> true;
        NotificationRelay relay = newRelay(3);

        // attempt 1 fails -> retry in 30s
        assertThat(relay.dispatchDue(10)).isEqualTo(new NotificationRelay.Result(0, 1, 0));
        assertThat(relay.dispatchDue(10).total()).as("not due again yet").isZero();
        var n = dsl.selectFrom(NOTIFICATIONS).where(NOTIFICATIONS.ID.eq(nid)).fetchSingle();
        assertThat(n.getStatus()).isEqualTo("PENDING");
        assertThat(n.getAttempts()).isEqualTo(1);
        assertThat(n.getNextAttemptAt().toInstant()).isEqualTo(TestBeans.T0.plusSeconds(30));
        assertThat(n.getLastError()).contains("simulated provider outage");

        // attempt 2 after 30s fails -> retry in 60s (exponential)
        clock.advance(Duration.ofSeconds(30));
        assertThat(relay.dispatchDue(10)).isEqualTo(new NotificationRelay.Result(0, 1, 0));
        n = dsl.selectFrom(NOTIFICATIONS).where(NOTIFICATIONS.ID.eq(nid)).fetchSingle();
        assertThat(n.getAttempts()).isEqualTo(2);
        assertThat(n.getNextAttemptAt().toInstant()).isEqualTo(TestBeans.T0.plusSeconds(30 + 60));

        // attempt 3 (== maxAttempts) fails -> dead letter
        clock.advance(Duration.ofSeconds(60));
        assertThat(relay.dispatchDue(10)).isEqualTo(new NotificationRelay.Result(0, 0, 1));
        n = dsl.selectFrom(NOTIFICATIONS).where(NOTIFICATIONS.ID.eq(nid)).fetchSingle();
        assertThat(n.getStatus()).isEqualTo("DEAD");
        assertThat(n.getAttempts()).isEqualTo(3);

        // dead rows are never picked up again, no matter how much time passes
        clock.advance(Duration.ofDays(30));
        assertThat(relay.dispatchDue(10).total()).isZero();
        assertThat(sender.attempts).hasSize(3);
        assertThat(sender.delivered).isEmpty();
    }

    @Test
    void transientFailureRecoversOnRetry() {
        UUID nid = UuidV7.next();
        insertDueNotification(nid, uid("a"));
        sender.failWhen = m -> m.attempt() < 3;
        NotificationRelay relay = newRelay(5);

        relay.dispatchDue(10);
        clock.advance(Duration.ofSeconds(30));
        relay.dispatchDue(10);
        clock.advance(Duration.ofSeconds(60));
        assertThat(relay.dispatchDue(10).sent()).isEqualTo(1);

        var n = dsl.selectFrom(NOTIFICATIONS).where(NOTIFICATIONS.ID.eq(nid)).fetchSingle();
        assertThat(n.getStatus()).isEqualTo("SENT");
        assertThat(n.getAttempts()).isEqualTo(3);
        assertThat(n.getLastError()).isNull();
        assertThat(sender.delivered).hasSize(1);
    }

    @Test
    void oneBadNotificationDoesNotBlockOthers() {
        UUID bad = UuidV7.next(), good = UuidV7.next();
        insertDueNotification(bad, uid("a"));
        insertDueNotification(good, uid("b"));
        sender.failWhen = m -> m.id().equals(bad);
        var result = newRelay(5).dispatchDue(10);
        assertThat(result.sent()).isEqualTo(1);
        assertThat(result.retried()).isEqualTo(1);
    }

    @Test
    void concurrentRelaysNeverSendTheSameNotificationTwice() throws Exception {
        int total = 40;
        for (int i = 0; i < total; i++) {
            insertDueNotification(UuidV7.next(), uid("u"));
        }
        ExecutorService pool = Executors.newFixedThreadPool(3);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<?>> fs = new ArrayList<>();
            for (int i = 0; i < 3; i++) {
                NotificationRelay relay = newRelay(5);
                fs.add(pool.submit(() -> {
                    start.await();
                    relay.dispatchDue(total);
                    return null;
                }));
            }
            start.countDown();
            for (Future<?> f : fs) {
                f.get(60, TimeUnit.SECONDS);
            }
        } finally {
            pool.shutdownNow();
        }
        assertThat(sender.attempts).hasSize(total);
        assertThat(sender.attempts.stream().map(m -> m.id()).distinct().count()).isEqualTo(total);
        assertThat(dsl.fetchCount(NOTIFICATIONS, NOTIFICATIONS.STATUS.eq("SENT"))).isEqualTo(total);
    }
}
