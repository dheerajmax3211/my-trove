package com.personalplatform.homepulse.detect;

/**
 * Per-appliance-type tuning of the detector. All durations are minutes. Numbers are deliberately conservative:
 * a missed early warning is better than a nagging system nobody trusts.
 *
 * @param onFraction          position of the ON/OFF threshold between standby (0) and peak (1) power
 * @param windowMinutes       length of the comparison windows the recent past is cut into
 * @param minWindowCoverage   a window needs this fraction of its minutes present to be used
 * @param sustainWindows      how many of the last {@code lookbackWindows} windows must deviate the same way
 * @param shiftWarnRel        relative ON-power shift that raises a warning
 * @param shiftCritRel        relative ON-power shift that raises a critical alert
 * @param dutyWarnRel         relative change of duty fraction that counts as drift
 * @param cycleLengthWarnRel  relative change of mean ON-cycle length that counts as drift
 * @param sigmaK              deviation must also exceed this many robust standard deviations of the baseline
 * @param noDataMinutes       silence longer than this raises NO_DATA
 * @param stuckOnFloorMinutes an ON run must last at least this long to be "stuck" (and at least 3x the learned max run)
 * @param stoppedFloorMinutes an OFF run must last at least this long to be "stopped" (and at least 3x the learned max)
 */
public record DetectorProfile(
        boolean checkPowerShift,
        boolean checkDutyDrift,
        boolean checkStuckOn,
        boolean checkStopped,
        double onFraction,
        int windowMinutes,
        double minWindowCoverage,
        int sustainWindows,
        int lookbackWindows,
        double shiftWarnRel,
        double shiftCritRel,
        double dutyWarnRel,
        double cycleLengthWarnRel,
        double sigmaK,
        int noDataMinutes,
        int stuckOnFloorMinutes,
        int stoppedFloorMinutes) {

    /** How far back the evaluator must fetch minute samples (covers the windows and long trailing runs). */
    public static final int FETCH_LOOKBACK_MINUTES = 48 * 60;
    /** Longest trailing run the detector can reason about. */
    public static final int MAX_RUN_LIMIT_MINUTES = 40 * 60;
    /** Samples further apart than this are not part of the same run. */
    public static final int MAX_GAP_MINUTES = 3;

    public static DetectorProfile forType(ApplianceType type) {
        return switch (type) {
            case FRIDGE -> new DetectorProfile(true, true, true, true, 0.5, 360, 0.7, 3, 4,
                    0.10, 0.25, 0.25, 0.30, 3.5, 60, 180, 360);
            // Duty fraction of an AC follows the weather; only a large change counts, power shift is the main signal.
            case AIR_CONDITIONER -> new DetectorProfile(true, true, true, false, 0.5, 360, 0.7, 3, 4,
                    0.10, 0.25, 0.60, 0.40, 3.5, 90, 720, 360);
            case WATER_PUMP -> new DetectorProfile(true, false, true, false, 0.5, 360, 0.7, 3, 4,
                    0.12, 0.25, 0.5, 0.5, 3.5, 90, 120, 360);
            case WASHING_MACHINE -> new DetectorProfile(false, false, true, false, 0.1, 360, 0.7, 3, 4,
                    0.15, 0.30, 0.5, 0.5, 3.5, 180, 240, 360);
            case OTHER -> new DetectorProfile(true, false, true, false, 0.5, 360, 0.7, 3, 4,
                    0.12, 0.25, 0.5, 0.5, 3.5, 120, 720, 360);
        };
    }
}
