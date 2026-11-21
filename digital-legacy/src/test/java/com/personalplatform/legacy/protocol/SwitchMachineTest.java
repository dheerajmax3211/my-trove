package com.personalplatform.legacy.protocol;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;

class SwitchMachineTest {

    static final Instant T0 = Instant.parse("2030-01-01T00:00:00Z");
    static final long H = 3600;
    static final long D = 86400;

    static final SwitchPolicy POLICY = new SwitchPolicy(
            7 * D, 2 * D, 3 * D,
            List.of(new EscalationStep(0, Urgency.NOTICE, Audience.OWNER, List.of(ChannelType.PUSH)),
                    new EscalationStep(D, Urgency.WARNING, Audience.ALL, List.of(ChannelType.EMAIL)),
                    new EscalationStep(2 * D, Urgency.URGENT, Audience.ALL, List.of(ChannelType.SMS))),
            2 * D, 2, 30 * D, List.of(new Contact(ChannelType.EMAIL, "me@example.com")));

    final SwitchMachine machine = new SwitchMachine(Duration.ofHours(1));

    static Instant at(long seconds) {
        return T0.plusSeconds(seconds);
    }

    static SwitchSnapshot active() {
        return SwitchSnapshot.active(T0, POLICY); // due at T0 + 7d
    }

    static SwitchSnapshot snap(SwitchState st, Instant entered, int steps, Instant quorumAt) {
        return new SwitchSnapshot(st, T0.plusSeconds(7 * D), null, entered, steps, quorumAt);
    }

    record Case(String name, SwitchSnapshot s, int approvals, Instant now, Class<? extends Transition> expected) {
        @Override
        public String toString() {
            return name;
        }
    }

    static Stream<Arguments> nextCases() {
        Instant due = at(7 * D);
        Instant grace = at(9 * D);
        return Stream.of(
                new Case("ACTIVE before due: nothing", active(), 0, at(7 * D - 1), null),
                new Case("ACTIVE at due -> GRACE", active(), 0, due, Transition.EnterGrace.class),
                new Case("GRACE before end: nothing", snap(SwitchState.GRACE, due, 0, null), 0, at(9 * D - 1), null),
                new Case("GRACE at end -> ESCALATING", snap(SwitchState.GRACE, due, 0, null), 0, grace,
                        Transition.EnterEscalating.class),
                new Case("ESCALATING step 0 due at entry", snap(SwitchState.ESCALATING, grace, 0, null), 0, grace,
                        Transition.ExecuteStep.class),
                new Case("ESCALATING step 1 not yet due", snap(SwitchState.ESCALATING, grace, 1, null), 0,
                        grace.plusSeconds(D - 1), null),
                new Case("ESCALATING step 1 due after 1 day", snap(SwitchState.ESCALATING, grace, 1, null), 0,
                        grace.plusSeconds(D), Transition.ExecuteStep.class),
                new Case("ESCALATING all steps done, before duration", snap(SwitchState.ESCALATING, grace, 3, null), 0,
                        grace.plusSeconds(3 * D - 1), null),
                new Case("ESCALATING all steps done, duration over", snap(SwitchState.ESCALATING, grace, 3, null), 0,
                        grace.plusSeconds(3 * D), Transition.EnterReleasePending.class),
                new Case("RELEASE_PENDING, no approvals", snap(SwitchState.RELEASE_PENDING, grace, 3, null), 0,
                        grace.plusSeconds(100 * D), null),
                new Case("RELEASE_PENDING, one of two approvals", snap(SwitchState.RELEASE_PENDING, grace, 3, null), 1,
                        grace.plusSeconds(100 * D), null),
                new Case("RELEASE_PENDING, quorum just reached", snap(SwitchState.RELEASE_PENDING, grace, 3, null), 2,
                        grace.plusSeconds(10), Transition.QuorumReached.class),
                new Case("RELEASE_PENDING, quorum, cool-off running",
                        snap(SwitchState.RELEASE_PENDING, grace, 3, grace), 2, grace.plusSeconds(2 * D - 1), null),
                new Case("RELEASE_PENDING, quorum, cool-off over -> RELEASED",
                        snap(SwitchState.RELEASE_PENDING, grace, 3, grace), 2, grace.plusSeconds(2 * D),
                        Transition.Release.class),
                new Case("RELEASE_PENDING, quorum lost during cool-off",
                        snap(SwitchState.RELEASE_PENDING, grace, 3, grace), 1, grace.plusSeconds(D),
                        Transition.QuorumLost.class),
                new Case("RELEASE_PENDING, quorum lost beats elapsed cool-off (no release without quorum)",
                        snap(SwitchState.RELEASE_PENDING, grace, 3, grace), 1, grace.plusSeconds(5 * D),
                        Transition.QuorumLost.class),
                new Case("RELEASED is terminal", snap(SwitchState.RELEASED, grace, 3, grace), 9, at(1000 * D), null),
                new Case("paused ACTIVE does not go to GRACE", new SwitchSnapshot(SwitchState.ACTIVE, due,
                        at(20 * D), T0, 0, null), 0, at(10 * D), null),
                new Case("pause ran out -> unpause", new SwitchSnapshot(SwitchState.ACTIVE, due, at(20 * D), T0, 0,
                        null), 0, at(20 * D), Transition.Unpause.class))
                .map(Arguments::of);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("nextCases")
    void nextTransitionTable(Case c) {
        Optional<Transition> t = machine.next(c.s(), POLICY, c.approvals(), c.now());
        if (c.expected() == null) {
            assertThat(t).isEmpty();
        } else {
            assertThat(t).isPresent().get().isInstanceOf(c.expected());
        }
    }

    @ParameterizedTest
    @EnumSource(value = SwitchState.class, names = {"ACTIVE", "GRACE", "ESCALATING", "RELEASE_PENDING"})
    void ownerCheckInReturnsToActiveFromEveryNonTerminalState(SwitchState state) {
        SwitchSnapshot s = new SwitchSnapshot(state, at(7 * D), null, at(8 * D), 2, state == SwitchState.RELEASE_PENDING
                ? at(9 * D) : null);
        Instant now = at(10 * D);
        SwitchSnapshot after = machine.checkIn(s, POLICY, now);
        assertThat(after.state()).isEqualTo(SwitchState.ACTIVE);
        assertThat(after.nextDueAt()).isEqualTo(now.plus(POLICY.checkInInterval()));
        assertThat(after.stepsExecuted()).isZero();
        assertThat(after.quorumReachedAt()).isNull();
        assertThat(after.pausedUntil()).isNull();
        // and nothing is due immediately afterwards, whatever approvals existed
        assertThat(machine.next(after, POLICY, 99, now)).isEmpty();
    }

    @Test
    void checkInAfterReleaseIsRejected() {
        assertThatThrownBy(() -> machine.checkIn(snap(SwitchState.RELEASED, at(0), 3, at(0)), POLICY, at(5)))
                .isInstanceOf(ProtocolException.class);
    }

    @Test
    void fullTimelineReplaysDeterministically() {
        // a scheduler that wakes exactly when the durable timer says so
        SwitchSnapshot s = active();
        Instant now = at(7 * D);
        int approvals = 0;
        List<Class<?>> seen = new java.util.ArrayList<>();
        for (int i = 0; i < 30 && s.state() != SwitchState.RELEASED; i++) {
            Optional<Transition> t = machine.next(s, POLICY, approvals, now);
            if (t.isPresent()) {
                seen.add(t.get().getClass());
                s = machine.apply(s, t.get(), POLICY);
                continue;
            }
            if (s.state() == SwitchState.RELEASE_PENDING && approvals == 0) {
                approvals = 2; // trustees vote one hour into the pending phase
                now = now.plusSeconds(H);
                continue;
            }
            now = machine.nextActionAt(s, POLICY).orElseThrow();
        }
        assertThat(seen).containsExactly(Transition.EnterGrace.class, Transition.EnterEscalating.class,
                Transition.ExecuteStep.class, Transition.ExecuteStep.class, Transition.ExecuteStep.class,
                Transition.EnterReleasePending.class, Transition.QuorumReached.class, Transition.Release.class);
        assertThat(s.state()).isEqualTo(SwitchState.RELEASED);
        // 7d interval + 2d grace + 3d escalation, then 1h until the vote, then the 2d cool-off
        assertThat(s.enteredAt()).isEqualTo(at(12 * D + H + 2 * D));
    }

    @Test
    void nominalAnchoringIgnoresShortSchedulerLateness() {
        Transition t = machine.next(active(), POLICY, 0, at(7 * D + 600)).orElseThrow(); // 10 min late
        assertThat(t.at()).isEqualTo(at(7 * D));
    }

    @Test
    void longOutageRestartsTheOwnersTimeBudgetInsteadOfBurningIt() {
        Instant now = at(7 * D + 5 * D); // scheduler was down for 5 days
        Transition g = machine.next(active(), POLICY, 0, now).orElseThrow();
        assertThat(g.at()).isEqualTo(now);
        SwitchSnapshot grace = machine.apply(active(), g, POLICY);
        assertThat(machine.next(grace, POLICY, 0, now)).isEmpty(); // owner still gets the full grace period
    }

    @Test
    void lateEscalationStepSlipsTheRestOfTheSchedule() {
        SwitchSnapshot s = snap(SwitchState.ESCALATING, at(9 * D), 1, null);
        Instant now = at(9 * D).plusSeconds(D + 3 * H); // step 1 due after 1 day, 3h late (> 1h tolerance)
        Transition.ExecuteStep x = (Transition.ExecuteStep) machine.next(s, POLICY, 0, now).orElseThrow();
        assertThat(x.slip()).isEqualTo(Duration.ofHours(3));
        SwitchSnapshot after = machine.apply(s, x, POLICY);
        assertThat(after.enteredAt()).isEqualTo(at(9 * D).plus(Duration.ofHours(3)));
        assertThat(machine.next(after, POLICY, 0, now)).isEmpty(); // step 2 is a full day away again
    }

    @Test
    void nextActionAtFollowsTheState() {
        assertThat(machine.nextActionAt(active(), POLICY)).contains(at(7 * D));
        assertThat(machine.nextActionAt(snap(SwitchState.GRACE, at(7 * D), 0, null), POLICY)).contains(at(9 * D));
        assertThat(machine.nextActionAt(snap(SwitchState.ESCALATING, at(9 * D), 1, null), POLICY))
                .contains(at(9 * D).plusSeconds(D));
        assertThat(machine.nextActionAt(snap(SwitchState.ESCALATING, at(9 * D), 3, null), POLICY))
                .contains(at(9 * D).plusSeconds(3 * D));
        assertThat(machine.nextActionAt(snap(SwitchState.RELEASE_PENDING, at(9 * D), 3, null), POLICY)).isEmpty();
        assertThat(machine.nextActionAt(snap(SwitchState.RELEASE_PENDING, at(9 * D), 3, at(12 * D)), POLICY))
                .contains(at(14 * D));
        assertThat(machine.nextActionAt(snap(SwitchState.RELEASED, at(9 * D), 3, null), POLICY)).isEmpty();
        assertThat(machine.nextActionAt(new SwitchSnapshot(SwitchState.ACTIVE, at(7 * D), at(20 * D), T0, 0, null),
                POLICY)).contains(at(20 * D));
    }

    // ---- pause ---------------------------------------------------------------------------------------

    private SwitchMachine.PauseResult pause(long seconds, PauseLedger ledger, Instant now) {
        return machine.pause(active(), POLICY, now, Duration.ofSeconds(seconds), ledger, Duration.ofDays(60),
                Duration.ofDays(90));
    }

    @Test
    void pauseWithinLimitsSetsPausedUntilAndConsumesBudget() {
        var r = pause(10 * D, PauseLedger.empty(), at(D));
        assertThat(r.snapshot().pausedUntil()).isEqualTo(at(11 * D));
        assertThat(r.ledger().usedSeconds()).isEqualTo(10 * D);
        // after the pause the check-in clock restarts from the pause end
        Transition u = machine.next(r.snapshot(), POLICY, 0, at(11 * D)).orElseThrow();
        assertThat(machine.apply(r.snapshot(), u, POLICY).nextDueAt()).isEqualTo(at(18 * D));
    }

    @Test
    void pauseLongerThanOwnPolicyMaxIsRejected() {
        assertThatThrownBy(() -> pause(31 * D, PauseLedger.empty(), at(D))).hasMessageContaining("exceeds the maximum");
    }

    @Test
    void pauseLongerThanPlatformMaxIsRejectedEvenIfPolicyAllowsMore() {
        SwitchPolicy generous = new SwitchPolicy(7 * D, 2 * D, 3 * D, POLICY.steps(), 2 * D, 2, 365 * D,
                POLICY.ownerContacts());
        assertThatThrownBy(() -> machine.pause(active(), generous, at(D), Duration.ofDays(61), PauseLedger.empty(),
                Duration.ofDays(60), Duration.ofDays(90))).hasMessageContaining("exceeds the maximum");
    }

    @Test
    void yearlyBudgetIsEnforcedAndWindowRollsOver() {
        PauseLedger used = new PauseLedger(T0, 85 * D);
        assertThatThrownBy(() -> pause(10 * D, used, at(D))).hasMessageContaining("yearly");
        var ok = pause(5 * D, used, at(D));
        assertThat(ok.ledger().usedSeconds()).isEqualTo(90 * D);
        // a year later the window starts over
        var fresh = machine.pause(SwitchSnapshot.active(at(400 * D), POLICY), POLICY, at(401 * D),
                Duration.ofDays(10), used, Duration.ofDays(60), Duration.ofDays(90));
        assertThat(fresh.ledger().usedSeconds()).isEqualTo(10 * D);
    }

    @Test
    void pauseRejectedWhenAlreadyPausedOverdueOrNotActive() {
        var r = pause(5 * D, PauseLedger.empty(), at(D));
        assertThatThrownBy(() -> machine.pause(r.snapshot(), POLICY, at(2 * D), Duration.ofDays(1), r.ledger(),
                Duration.ofDays(60), Duration.ofDays(90))).hasMessageContaining("already paused");
        assertThatThrownBy(() -> pause(D, PauseLedger.empty(), at(7 * D))).hasMessageContaining("overdue");
        assertThatThrownBy(() -> machine.pause(snap(SwitchState.GRACE, at(7 * D), 0, null), POLICY, at(8 * D),
                Duration.ofDays(1), PauseLedger.empty(), Duration.ofDays(60), Duration.ofDays(90)))
                .hasMessageContaining("ACTIVE");
        assertThatThrownBy(() -> pause(0, PauseLedger.empty(), at(D))).hasMessageContaining("positive");
    }

    @Test
    void policyWithPauseDisabledRejectsEverything() {
        SwitchPolicy none = new SwitchPolicy(7 * D, 2 * D, 3 * D, POLICY.steps(), 2 * D, 2, 0, POLICY.ownerContacts());
        assertThatThrownBy(() -> machine.pause(active(), none, at(D), Duration.ofSeconds(1), PauseLedger.empty(),
                Duration.ofDays(60), Duration.ofDays(90))).hasMessageContaining("exceeds");
    }

    @Test
    void resumeRefundsUnusedPauseAndRestartsInterval() {
        var r = pause(10 * D, PauseLedger.empty(), at(D)); // until day 11
        var back = machine.resume(r.snapshot(), POLICY, at(4 * D), r.ledger());
        assertThat(back.snapshot().pausedUntil()).isNull();
        assertThat(back.snapshot().nextDueAt()).isEqualTo(at(11 * D));
        assertThat(back.ledger().usedSeconds()).isEqualTo(3 * D); // only the 3 days actually used
        assertThatThrownBy(() -> machine.resume(active(), POLICY, at(D), PauseLedger.empty()))
                .hasMessageContaining("not paused");
    }
}
