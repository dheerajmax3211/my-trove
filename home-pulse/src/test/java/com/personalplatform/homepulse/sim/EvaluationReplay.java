package com.personalplatform.homepulse.sim;

import com.personalplatform.homepulse.detect.AlertKind;
import com.personalplatform.homepulse.detect.AlertReconciler;
import com.personalplatform.homepulse.detect.AnomalyDetector;
import com.personalplatform.homepulse.detect.Baseline;
import com.personalplatform.homepulse.detect.DetectorProfile;
import com.personalplatform.homepulse.detect.Finding;
import com.personalplatform.homepulse.detect.MinuteSample;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Replays a simulated sample stream through the real detector + reconciler exactly as the scheduled job does
 * (fixed step, sliding 48 h lookback), keeping the alert book in memory.
 */
public final class EvaluationReplay {

    public static final class Alert {
        public final UUID id = UUID.randomUUID();
        public final Finding opened;
        public final Instant openedAt;
        public Finding latest;
        public int clearStreak;
        public Instant resolvedAt;

        Alert(Finding f, Instant at) {
            this.opened = f;
            this.latest = f;
            this.openedAt = at;
        }

        public AlertKind kind() {
            return opened.kind();
        }
    }

    public final List<Alert> all = new ArrayList<>();

    private final DetectorProfile profile;
    private final Baseline baseline;
    private final List<MinuteSample> samples;
    private final Instant lastSeenFloor;
    private final int resolveAfterClearRuns;

    public EvaluationReplay(DetectorProfile profile, Baseline baseline, List<MinuteSample> samples,
                            Instant registeredAt, int resolveAfterClearRuns) {
        this.profile = profile;
        this.baseline = baseline;
        this.samples = samples;
        this.lastSeenFloor = registeredAt;
        this.resolveAfterClearRuns = resolveAfterClearRuns;
    }

    public List<Alert> live() {
        return all.stream().filter(a -> a.resolvedAt == null).toList();
    }

    public void run(Instant from, Instant to, Duration step) {
        for (Instant now = from; !now.isAfter(to); now = now.plus(step)) {
            evaluateAt(now);
        }
    }

    public void evaluateAt(Instant now) {
        Instant lookbackStart = now.minusSeconds(60L * DetectorProfile.FETCH_LOOKBACK_MINUTES);
        List<MinuteSample> recent = samples.stream()
                .filter(s -> !s.ts().isBefore(lookbackStart) && s.ts().isBefore(now)).toList();
        var evaluation = AnomalyDetector.evaluate(profile, baseline, recent, lastSeenFloor, now,
                live().stream().map(Alert::kind).collect(java.util.stream.Collectors.toSet()));
        var liveAlerts = live().stream()
                .map(a -> new AlertReconciler.LiveAlert(a.id, a.kind(), a.latest.severity(), a.clearStreak)).toList();
        var plan = AlertReconciler.reconcile(liveAlerts, evaluation, resolveAfterClearRuns);
        plan.toOpen().forEach(f -> all.add(new Alert(f, now)));
        plan.toRefresh().forEach(r -> {
            Alert a = byId(r.alertId());
            a.latest = r.finding();
            a.clearStreak = 0;
        });
        plan.toTick().forEach(t -> byId(t.alertId()).clearStreak = t.clearStreak());
        plan.toResolve().forEach(id -> byId(id).resolvedAt = now);
    }

    private Alert byId(UUID id) {
        return all.stream().filter(a -> a.id.equals(id)).findFirst().orElseThrow();
    }
}
