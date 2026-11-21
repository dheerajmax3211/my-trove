package com.personalplatform.legacy.protocol;

import java.time.Duration;
import java.time.Instant;

/** One step of protocol progress decided by {@link SwitchMachine}. {@code at} is the (anchored) event time. */
public sealed interface Transition {

    Instant at();

    /** A vacation pause ran out. */
    record Unpause(Instant at) implements Transition {}

    /** Missed check-in: ACTIVE -> GRACE. */
    record EnterGrace(Instant at) implements Transition {}

    /** Grace over: GRACE -> ESCALATING. */
    record EnterEscalating(Instant at) implements Transition {}

    /** Run escalation step {@code index}; {@code slip} pushes the rest of the schedule back after an outage. */
    record ExecuteStep(int index, Instant at, Duration slip) implements Transition {}

    /** Escalation over: ESCALATING -> RELEASE_PENDING. */
    record EnterReleasePending(Instant at) implements Transition {}

    record QuorumReached(Instant at) implements Transition {}

    record QuorumLost(Instant at) implements Transition {}

    /** Quorum held, cool-off elapsed, owner silent: RELEASE_PENDING -> RELEASED. */
    record Release(Instant at) implements Transition {}
}
