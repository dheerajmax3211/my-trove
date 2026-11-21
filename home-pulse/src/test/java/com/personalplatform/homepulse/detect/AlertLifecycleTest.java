package com.personalplatform.homepulse.detect;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.homepulse.sim.ApplianceSimulator;
import com.personalplatform.homepulse.sim.ApplianceSimulator.Degradation;
import com.personalplatform.homepulse.sim.EvaluationReplay;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AlertLifecycleTest {

    private static Finding finding(AlertKind kind, Severity sev) {
        return new Finding(kind, sev, "m", Map.of("x", 1));
    }

    private static AnomalyDetector.Evaluation eval(List<Finding> findings, AlertKind... evaluated) {
        return new AnomalyDetector.Evaluation(findings, Set.of(evaluated));
    }

    @Test
    void newConditionOpensAnAlert() {
        var plan = AlertReconciler.reconcile(List.of(),
                eval(List.of(finding(AlertKind.STUCK_ON, Severity.WARNING)), AlertKind.STUCK_ON), 3);
        assertThat(plan.toOpen()).hasSize(1);
        assertThat(plan.toRefresh()).isEmpty();
    }

    @Test
    void persistingConditionRefreshesInsteadOfOpeningASecondAlert() {
        UUID id = UUID.randomUUID();
        var live = List.of(new AlertReconciler.LiveAlert(id, AlertKind.STUCK_ON, Severity.WARNING, 2));
        var plan = AlertReconciler.reconcile(live,
                eval(List.of(finding(AlertKind.STUCK_ON, Severity.CRITICAL)), AlertKind.STUCK_ON), 3);
        assertThat(plan.toOpen()).isEmpty();
        assertThat(plan.toRefresh()).hasSize(1);
        assertThat(plan.toRefresh().get(0).alertId()).isEqualTo(id);
        assertThat(plan.toResolve()).isEmpty();
        assertThat(plan.toTick()).isEmpty();
    }

    @Test
    void clearedConditionResolvesOnlyAfterConsecutiveCleanRuns() {
        UUID id = UUID.randomUUID();
        var evaluation = eval(List.of(), AlertKind.STUCK_ON);
        var first = AlertReconciler.reconcile(
                List.of(new AlertReconciler.LiveAlert(id, AlertKind.STUCK_ON, Severity.WARNING, 0)), evaluation, 3);
        assertThat(first.toTick()).extracting(AlertReconciler.ClearTick::clearStreak).containsExactly(1);
        assertThat(first.toResolve()).isEmpty();
        var third = AlertReconciler.reconcile(
                List.of(new AlertReconciler.LiveAlert(id, AlertKind.STUCK_ON, Severity.WARNING, 2)), evaluation, 3);
        assertThat(third.toResolve()).containsExactly(id);
    }

    @Test
    void kindsThatWereNotEvaluatedAreLeftAlone() {
        UUID id = UUID.randomUUID();
        var plan = AlertReconciler.reconcile(
                List.of(new AlertReconciler.LiveAlert(id, AlertKind.POWER_SHIFT, Severity.WARNING, 2)),
                eval(List.of(finding(AlertKind.NO_DATA, Severity.WARNING)), AlertKind.NO_DATA), 3);
        assertThat(plan.toResolve()).isEmpty();
        assertThat(plan.toTick()).isEmpty();
        assertThat(plan.toOpen()).hasSize(1);
    }

    @Test
    void differentKindsAreIndependent() {
        var plan = AlertReconciler.reconcile(
                List.of(new AlertReconciler.LiveAlert(UUID.randomUUID(), AlertKind.STUCK_ON, Severity.WARNING, 0)),
                eval(List.of(finding(AlertKind.POWER_SHIFT, Severity.WARNING)), AlertKind.STUCK_ON, AlertKind.POWER_SHIFT), 3);
        assertThat(plan.toOpen()).extracting(Finding::kind).containsExactly(AlertKind.POWER_SHIFT);
        assertThat(plan.toTick()).hasSize(1);
    }

    // ---------------------------------------------------- end to end on simulated time

    @Test
    void anEpisodeProducesExactlyOneAlertThatAutoResolvesAndARecurrenceOpensANewOne() {
        Instant start = AnomalyDetectorTest.START;
        var p = DetectorProfile.forType(ApplianceType.FRIDGE);
        var healthy = ApplianceSimulator.fridge(start, 20, 101, Degradation.NONE);
        Baseline b = AnomalyDetectorTest.learn(healthy, p);

        Instant ep1 = start.plus(10, ChronoUnit.DAYS);
        Instant ep2 = start.plus(15, ChronoUnit.DAYS);
        var samples = ApplianceSimulator.stuckOn(healthy, ep1, ep1.plus(7, ChronoUnit.HOURS), 118, 1);
        samples = ApplianceSimulator.stuckOn(samples, ep2, ep2.plus(7, ChronoUnit.HOURS), 118, 2);

        // evaluate every 5 minutes like the production job: 80+ evaluations inside each episode
        var replay = new EvaluationReplay(p, b, samples, start, 3);
        replay.run(start.plus(8, ChronoUnit.DAYS), start.plus(18, ChronoUnit.DAYS), Duration.ofMinutes(5));

        var stuck = replay.all.stream().filter(a -> a.kind() == AlertKind.STUCK_ON).toList();
        assertThat(stuck).as("one alert per episode, not one per evaluation").hasSize(2);
        for (var a : stuck) {
            assertThat(a.resolvedAt).as("auto-resolved once the unit cycles again").isNotNull();
            assertThat(a.latest.severity()).isEqualTo(Severity.CRITICAL);   // escalated while it kept running
        }
        assertThat(stuck.get(0).openedAt).isBetween(ep1.plus(170, ChronoUnit.MINUTES), ep1.plus(200, ChronoUnit.MINUTES));
        assertThat(stuck.get(0).resolvedAt).isAfter(ep1.plus(7, ChronoUnit.HOURS));
        assertThat(stuck.get(1).openedAt).isAfter(stuck.get(0).resolvedAt);
        // every alert (any kind) is resolved by the end: nothing is left dangling on a healthy unit
        assertThat(replay.live()).isEmpty();
    }
}
