package com.personalplatform.homepulse.detect;

import java.time.Instant;

/**
 * The learned normal electrical signature of one appliance. Everything is a robust statistic (median / MAD-derived
 * spread) so a handful of door-opens, brown-outs or sensor glitches during learning cannot skew it.
 *
 * @param standbyWatts       typical OFF/standby draw (10th percentile)
 * @param peakWatts          typical running draw (99th percentile)
 * @param onThresholdWatts   draw above which the appliance counts as ON
 * @param switching          true when standby and peak are far enough apart for ON/OFF analysis to make sense
 * @param onLevelMedian      median over windows of the median ON-state power
 * @param onLevelSpread      robust standard deviation (1.4826 * MAD) of that per-window statistic
 * @param dutyMedian         median over windows of the ON fraction
 * @param dutySpread         robust standard deviation of the per-window ON fraction
 * @param cycleMinutesMedian median over windows of the mean completed ON-run length (0 when unknown)
 * @param cycleMinutesSpread robust standard deviation of that
 * @param maxOnRunMinutes    long (99th percentile) completed ON run seen while learning
 * @param maxOffRunMinutes   long (99th percentile) completed OFF run seen while learning
 * @param windowsUsed        number of comparison windows the statistics are based on
 * @param learnedFrom        start of the learning period
 * @param learnedTo          end of the learning period
 */
public record Baseline(
        double standbyWatts,
        double peakWatts,
        double onThresholdWatts,
        boolean switching,
        double onLevelMedian,
        double onLevelSpread,
        double dutyMedian,
        double dutySpread,
        double cycleMinutesMedian,
        double cycleMinutesSpread,
        double maxOnRunMinutes,
        double maxOffRunMinutes,
        int windowsUsed,
        Instant learnedFrom,
        Instant learnedTo) {}
