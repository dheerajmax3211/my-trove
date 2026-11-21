package com.personalplatform.legacy.protocol;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Pure transition logic of the check-in protocol: no I/O, no clock, no randomness. Everything is a function of
 * (snapshot, policy, approval count, now) so it can be tested exhaustively and replayed.
 *
 * <pre>
 *   ACTIVE --(due)--> GRACE --(grace elapsed)--> ESCALATING --(escalation over)--> RELEASE_PENDING --> RELEASED
 *      ^                 |                            |                                  |
 *      +---- owner check-in (from every state except RELEASED) ----------------------------+
 * </pre>
 *
 * <p>Timeline anchoring: transitions are anchored at their nominal time (e.g. due date + grace) so the result does
 * not depend on how late the scheduler happened to run. If the scheduler was down for longer than
 * {@code lateTolerance}, anchoring falls back to {@code now} instead, which restarts the owner's time budget rather
 * than burning it during an outage of OUR making.
 */
public final class SwitchMachine {

    private final Duration lateTolerance;

    public SwitchMachine(Duration lateTolerance) {
        this.lateTolerance = lateTolerance;
    }

    /** Next transition that is due at {@code now}, if any. Call repeatedly (applying each) until empty. */
    public Optional<Transition> next(SwitchSnapshot s, SwitchPolicy p, int approvals, Instant now) {
        return switch (s.state()) {
            case ACTIVE -> {
                if (s.paused()) {
                    yield due(s.pausedUntil(), now).map(Transition.Unpause::new);
                }
                yield s.nextDueAt() == null
                        ? Optional.empty()
                        : due(s.nextDueAt(), now).map(Transition.EnterGrace::new);
            }
            case GRACE -> due(s.enteredAt().plus(p.grace()), now).map(Transition.EnterEscalating::new);
            case ESCALATING -> escalating(s, p, now);
            case RELEASE_PENDING -> releasePending(s, p, approvals, now);
            case RELEASED -> Optional.empty();
        };
    }

    private Optional<Transition> escalating(SwitchSnapshot s, SwitchPolicy p, Instant now) {
        List<EscalationStep> steps = p.steps();
        if (s.stepsExecuted() < steps.size()) {
            Instant due = s.enteredAt().plus(steps.get(s.stepsExecuted()).offset());
            if (now.isBefore(due)) {
                return Optional.empty();
            }
            Duration lateness = Duration.between(due, now);
            Duration slip = lateness.compareTo(lateTolerance) > 0 ? lateness : Duration.ZERO;
            return Optional.of(new Transition.ExecuteStep(
                    s.stepsExecuted(), slip.isZero() ? due : now, slip));
        }
        return due(s.enteredAt().plus(p.escalationDuration()), now).map(Transition.EnterReleasePending::new);
    }

    private Optional<Transition> releasePending(SwitchSnapshot s, SwitchPolicy p, int approvals, Instant now) {
        boolean quorumMet = approvals >= p.quorum();
        if (s.quorumReachedAt() == null) {
            return quorumMet ? Optional.of(new Transition.QuorumReached(now)) : Optional.empty();
        }
        if (!quorumMet) {
            return Optional.of(new Transition.QuorumLost(now));
        }
        Instant releaseAt = s.quorumReachedAt().plus(p.coolOff());
        return now.isBefore(releaseAt) ? Optional.empty() : Optional.of(new Transition.Release(now));
    }

    private Optional<Instant> due(Instant nominal, Instant now) {
        if (now.isBefore(nominal)) {
            return Optional.empty();
        }
        Duration lateness = Duration.between(nominal, now);
        return Optional.of(lateness.compareTo(lateTolerance) > 0 ? now : nominal);
    }

    /** The snapshot after {@code t}; {@code p} is needed to compute the next check-in date on unpause. */
    public SwitchSnapshot apply(SwitchSnapshot s, Transition t, SwitchPolicy p) {
        return switch (t) {
            case Transition.Unpause u -> new SwitchSnapshot(
                    SwitchState.ACTIVE, u.at().plus(p.checkInInterval()), null, u.at(), 0, null);
            case Transition.EnterGrace g -> new SwitchSnapshot(
                    SwitchState.GRACE, s.nextDueAt(), null, g.at(), 0, null);
            case Transition.EnterEscalating e -> new SwitchSnapshot(
                    SwitchState.ESCALATING, s.nextDueAt(), null, e.at(), 0, null);
            case Transition.ExecuteStep x -> new SwitchSnapshot(
                    SwitchState.ESCALATING, s.nextDueAt(), null, s.enteredAt().plus(x.slip()), x.index() + 1, null);
            case Transition.EnterReleasePending r -> new SwitchSnapshot(
                    SwitchState.RELEASE_PENDING, s.nextDueAt(), null, r.at(), s.stepsExecuted(), null);
            case Transition.QuorumReached q -> new SwitchSnapshot(
                    s.state(), s.nextDueAt(), null, s.enteredAt(), s.stepsExecuted(), q.at());
            case Transition.QuorumLost q -> new SwitchSnapshot(
                    s.state(), s.nextDueAt(), null, s.enteredAt(), s.stepsExecuted(), null);
            case Transition.Release r -> new SwitchSnapshot(
                    SwitchState.RELEASED, s.nextDueAt(), null, r.at(), s.stepsExecuted(), s.quorumReachedAt());
        };
    }

    /** Owner check-in: back to ACTIVE from any non-terminal state; clears pause, steps and quorum. */
    public SwitchSnapshot checkIn(SwitchSnapshot s, SwitchPolicy p, Instant now) {
        if (s.state().terminal()) {
            throw new ProtocolException("The vault has already been released; a check-in can no longer cancel it");
        }
        return SwitchSnapshot.active(now, p);
    }

    /** The earliest instant at which {@link #next} could yield something purely because time passed. */
    public Optional<Instant> nextActionAt(SwitchSnapshot s, SwitchPolicy p) {
        return switch (s.state()) {
            case ACTIVE -> Optional.ofNullable(s.paused() ? s.pausedUntil() : s.nextDueAt());
            case GRACE -> Optional.of(s.enteredAt().plus(p.grace()));
            case ESCALATING -> Optional.of(s.stepsExecuted() < p.steps().size()
                    ? s.enteredAt().plus(p.steps().get(s.stepsExecuted()).offset())
                    : s.enteredAt().plus(p.escalationDuration()));
            case RELEASE_PENDING -> Optional.ofNullable(
                    s.quorumReachedAt() == null ? null : s.quorumReachedAt().plus(p.coolOff()));
            case RELEASED -> Optional.empty();
        };
    }

    /** Result of starting a vacation pause. */
    public record PauseResult(SwitchSnapshot snapshot, PauseLedger ledger) {}

    /**
     * Starts a pause. Allowed only while ACTIVE, not overdue and not already paused; the length is capped by the
     * owner's own policy, the platform cap and the rolling yearly budget.
     */
    public PauseResult pause(
            SwitchSnapshot s,
            SwitchPolicy p,
            Instant now,
            Duration requested,
            PauseLedger ledger,
            Duration platformMaxPause,
            Duration yearlyBudget) {
        if (s.state() != SwitchState.ACTIVE) {
            throw new ProtocolException("Pausing is only possible while the switch is ACTIVE; check in first");
        }
        if (s.paused()) {
            throw new ProtocolException("The switch is already paused");
        }
        if (s.nextDueAt() == null || !now.isBefore(s.nextDueAt())) {
            throw new ProtocolException("A check-in is overdue; check in before pausing");
        }
        if (requested == null || requested.isZero() || requested.isNegative()) {
            throw new ProtocolException("Pause duration must be positive");
        }
        Duration cap = p.maxPause().compareTo(platformMaxPause) < 0 ? p.maxPause() : platformMaxPause;
        if (requested.compareTo(cap) > 0) {
            throw new ProtocolException("Pause of " + requested.toDays() + "d exceeds the maximum of "
                    + cap.toDays() + "d (" + cap.toSeconds() + "s)");
        }
        PauseLedger current = ledger.at(now);
        if (Duration.ofSeconds(current.usedSeconds()).plus(requested).compareTo(yearlyBudget) > 0) {
            throw new ProtocolException("Pause would exceed the yearly vacation budget of " + yearlyBudget.toDays()
                    + " days");
        }
        Instant until = now.plus(requested);
        return new PauseResult(
                new SwitchSnapshot(SwitchState.ACTIVE, s.nextDueAt(), until, s.enteredAt(), 0, null),
                new PauseLedger(current.windowStart(), current.usedSeconds() + requested.toSeconds()));
    }

    /** Ends a pause early: the unused remainder is refunded and the next check-in is a full interval away. */
    public PauseResult resume(SwitchSnapshot s, SwitchPolicy p, Instant now, PauseLedger ledger) {
        if (!s.paused()) {
            throw new ProtocolException("The switch is not paused");
        }
        long unused = Math.max(0, Duration.between(now, s.pausedUntil()).toSeconds());
        PauseLedger refunded = new PauseLedger(ledger.windowStart(), Math.max(0, ledger.usedSeconds() - unused));
        return new PauseResult(SwitchSnapshot.active(now, p), refunded);
    }
}
