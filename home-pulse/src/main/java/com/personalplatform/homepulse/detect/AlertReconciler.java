package com.personalplatform.homepulse.detect;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Pure alert lifecycle: turns "what the detector sees now" plus "what is already open" into a change plan.
 * <ul>
 *   <li>Dedup: at most one live alert per kind; a still-present condition refreshes it, never opens a second one.</li>
 *   <li>Auto-resolve: a live alert whose condition has been absent for {@code resolveAfterClearRuns} consecutive
 *       evaluations is resolved (hysteresis against flapping at a threshold).</li>
 *   <li>Kinds that could not be evaluated this run (not in {@code evaluated}) are left untouched.</li>
 * </ul>
 */
public final class AlertReconciler {

    /** A live (OPEN or ACKNOWLEDGED) alert as stored. */
    public record LiveAlert(UUID id, AlertKind kind, Severity severity, int clearStreak) {}

    public record Refresh(UUID alertId, Finding finding) {}

    public record ClearTick(UUID alertId, int clearStreak) {}

    public record Plan(List<Finding> toOpen, List<Refresh> toRefresh, List<ClearTick> toTick, List<UUID> toResolve) {
        public boolean isEmpty() {
            return toOpen.isEmpty() && toRefresh.isEmpty() && toTick.isEmpty() && toResolve.isEmpty();
        }
    }

    private AlertReconciler() {}

    public static Plan reconcile(List<LiveAlert> live, AnomalyDetector.Evaluation evaluation, int resolveAfterClearRuns) {
        Map<AlertKind, LiveAlert> liveByKind = new EnumMap<>(AlertKind.class);
        for (LiveAlert a : live) {
            liveByKind.put(a.kind(), a);   // the DB guarantees one live alert per kind
        }
        Map<AlertKind, Finding> found = new EnumMap<>(AlertKind.class);
        for (Finding f : evaluation.findings()) {
            found.put(f.kind(), f);
        }
        List<Finding> toOpen = new ArrayList<>();
        List<Refresh> toRefresh = new ArrayList<>();
        List<ClearTick> toTick = new ArrayList<>();
        List<UUID> toResolve = new ArrayList<>();
        Set<AlertKind> evaluated = evaluation.evaluated();

        for (Finding f : found.values()) {
            LiveAlert existing = liveByKind.get(f.kind());
            if (existing == null) {
                toOpen.add(f);
            } else {
                toRefresh.add(new Refresh(existing.id(), f));
            }
        }
        for (LiveAlert a : liveByKind.values()) {
            if (found.containsKey(a.kind()) || !evaluated.contains(a.kind())) {
                continue;
            }
            int streak = a.clearStreak() + 1;
            if (streak >= resolveAfterClearRuns) {
                toResolve.add(a.id());
            } else {
                toTick.add(new ClearTick(a.id(), streak));
            }
        }
        return new Plan(toOpen, toRefresh, toTick, toResolve);
    }
}
