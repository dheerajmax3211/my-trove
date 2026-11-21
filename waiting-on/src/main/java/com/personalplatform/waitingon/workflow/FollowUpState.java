package com.personalplatform.waitingon.workflow;

/**
 * Query result. Times are epoch millis of workflow (deterministic) time; {@code nextActionAtEpochMillis} is null
 * once the workflow is finished.
 */
public record FollowUpState(Stage stage, NextAction nextAction, Long nextActionAtEpochMillis, int snoozedDays) {
}
