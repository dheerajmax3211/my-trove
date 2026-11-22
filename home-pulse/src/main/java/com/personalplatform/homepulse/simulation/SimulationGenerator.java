package com.personalplatform.homepulse.simulation;

import com.personalplatform.homepulse.detect.ApplianceType;
import com.personalplatform.homepulse.ingest.ReadingInput;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.SplittableRandom;

/**
 * Pure generator of plausible smart-plug readings at a 5-minute cadence. The value of a slot is a function of
 * (seed, UTC day, slot) only, so regenerating an overlapping range yields identical readings.
 *
 * <p>Each UTC day is simulated on its own from an RNG seeded with (seed, day), starting its first cycle at a random
 * phase. A cycle that would cross midnight is simply cut there.
 */
public final class SimulationGenerator {

    private static final long STEP_SECONDS = 300;
    private static final int SLOTS_PER_DAY = 288;

    private SimulationGenerator() {}

    /** Slot timestamps are multiples of 5 minutes, both ends inclusive: {@code days * 288 + 1} readings. */
    public static List<ReadingInput> generate(ApplianceType type, long seed, SimulationScenario scenario, Instant now, int days) {
        long endSlot = Math.floorDiv(now.getEpochSecond(), STEP_SECONDS);
        long startSlot = endSlot - (long) days * SLOTS_PER_DAY;
        List<ReadingInput> out = new ArrayList<>((int) (endSlot - startSlot + 1));
        long cachedDay = Long.MIN_VALUE;
        double[] day = null;
        for (long slot = startSlot; slot <= endSlot; slot++) {
            long dayIndex = Math.floorDiv(slot, SLOTS_PER_DAY);
            if (dayIndex != cachedDay) {
                day = simulateDay(type, seed, dayIndex);
                cachedDay = dayIndex;
            }
            double watts = day[(int) Math.floorMod(slot, SLOTS_PER_DAY)];
            if (scenario == SimulationScenario.ANOMALY) {
                watts = anomaly(type, watts, endSlot - slot, new SplittableRandom(mix(seed, slot, 7)));
            }
            SplittableRandom r = new SplittableRandom(mix(seed, slot, 3));
            double volts = round1(230 + r.nextDouble(-2.5, 2.5));
            watts = round1(Math.max(0, watts));
            out.add(new ReadingInput(Instant.ofEpochSecond(slot * STEP_SECONDS), watts, volts, round2(watts / volts)));
        }
        return out;
    }

    /** Hours of anomaly at the end of the series per type (long enough to pass the detector's floors). */
    public static int anomalyHours(ApplianceType type) {
        return switch (type) {
            case FRIDGE -> 6;               // compressor never stops (STUCK_ON floor 3 h)
            case AIR_CONDITIONER -> 16;     // runs without pause (STUCK_ON floor 12 h)
            case WATER_PUMP -> 4;           // pump never stops (STUCK_ON floor 2 h)
            case WASHING_MACHINE -> 6;      // stuck in the heating stage (STUCK_ON floor 4 h)
            case OTHER -> 24;               // base load up 50% (needs 3 of the last 4 six-hour windows)
        };
    }

    private static double anomaly(ApplianceType type, double normal, long slotsFromEnd, SplittableRandom r) {
        if (slotsFromEnd >= anomalyHours(type) * 12L) {
            return normal;
        }
        return switch (type) {
            case FRIDGE -> 168 + r.nextDouble(-6, 6);
            case AIR_CONDITIONER -> 1650 + r.nextDouble(-40, 40);
            case WATER_PUMP -> 700 + r.nextDouble(-20, 20);
            case WASHING_MACHINE -> 2000 + r.nextDouble(-30, 30);
            case OTHER -> normal * 1.5;
        };
    }

    private static double[] simulateDay(ApplianceType type, long seed, long dayIndex) {
        SplittableRandom r = new SplittableRandom(mix(seed, dayIndex, 1));
        return switch (type) {
            case FRIDGE -> fridge(r);
            case AIR_CONDITIONER -> airConditioner(r);
            case WATER_PUMP -> waterPump(r);
            case WASHING_MACHINE -> washingMachine(r);
            case OTHER -> baseLoad(r);
        };
    }

    /** Compressor: about 130 W for 20-30 min, then about 6 W for 35-50 min, with jitter. */
    private static double[] fridge(SplittableRandom r) {
        double[] d = new double[SLOTS_PER_DAY];
        int i = -r.nextInt(12);
        boolean on = r.nextBoolean();
        while (i < SLOTS_PER_DAY) {
            int len = on ? 4 + r.nextInt(3) : 7 + r.nextInt(4);
            for (int k = 0; k < len; k++, i++) {
                if (i >= 0 && i < SLOTS_PER_DAY) {
                    d[i] = on ? 130 + r.nextDouble(-7, 7) : 6 + r.nextDouble(-1, 1);
                }
            }
            on = !on;
        }
        return d;
    }

    /** Compressor cycles of 1,100-1,500 W; hotter afternoons draw more and run longer with shorter pauses. */
    private static double[] airConditioner(SplittableRandom r) {
        double[] d = new double[SLOTS_PER_DAY];
        int i = -r.nextInt(12);
        boolean on = r.nextBoolean();
        while (i < SLOTS_PER_DAY) {
            double hour = Math.max(0, i) / 12.0;
            double heat = 0.5 + 0.5 * Math.sin((hour - 9) / 24.0 * 2 * Math.PI);   // peaks at 15:00
            int len = on ? 5 + (int) Math.round(heat * 4) + r.nextInt(3) : 11 - (int) Math.round(heat * 7) + r.nextInt(3);
            for (int k = 0; k < len; k++, i++) {
                if (i >= 0 && i < SLOTS_PER_DAY) {
                    double h = i / 12.0;
                    double level = 1300 + 150 * Math.sin((h - 9) / 24.0 * 2 * Math.PI);
                    d[i] = on ? level + r.nextDouble(-25, 25) : 3 + r.nextDouble(-1, 1);
                }
            }
            on = !on;
        }
        return d;
    }

    /** Short bursts of about 700 W (5-10 min), mostly in the morning and the evening. */
    private static double[] waterPump(SplittableRandom r) {
        double[] d = new double[SLOTS_PER_DAY];
        int i = 0;
        while (i < SLOTS_PER_DAY) {
            int hour = i / 12;
            double p = (hour >= 6 && hour < 9) || (hour >= 18 && hour < 21) ? 0.22 : hour >= 9 && hour < 18 ? 0.07 : 0.02;
            if (r.nextDouble() < p) {
                int len = 1 + r.nextInt(2);
                for (int k = 0; k < len && i < SLOTS_PER_DAY; k++, i++) {
                    d[i] = 700 + r.nextDouble(-30, 30);
                }
            }
            if (i < SLOTS_PER_DAY) {
                d[i++] = 2 + r.nextDouble(-0.5, 0.5);
            }
        }
        return d;
    }

    /** One to three programmes a day (about 80 min: fill, heat, wash, drain, rinse, spin), standby otherwise. */
    private static double[] washingMachine(SplittableRandom r) {
        double[] d = new double[SLOTS_PER_DAY];
        for (int i = 0; i < SLOTS_PER_DAY; i++) {
            d[i] = 2 + r.nextDouble(-0.4, 0.4);
        }
        int[][] hours = {{7, 11}, {12, 17}, {18, 21}};   // one programme per part of the day, each with a probability
        double[] chance = {0.8, 0.55, 0.65};
        int[] stageSlots = {2, 4, 4, 1, 2, 3};
        double[] stageWatts = {90, 2000, 220, 70, 260, 520};
        for (int p = 0; p < hours.length; p++) {
            boolean runs = r.nextDouble() < chance[p];
            int start = (hours[p][0] + r.nextInt(hours[p][1] - hours[p][0] + 1)) * 12 + r.nextInt(12);
            if (!runs) {
                continue;
            }
            int i = start;
            for (int s = 0; s < stageSlots.length; s++) {
                for (int k = 0; k < stageSlots[s] && i < SLOTS_PER_DAY; k++, i++) {
                    d[i] = stageWatts[s] * (1 + r.nextDouble(-0.04, 0.04));
                }
            }
        }
        return d;
    }

    /** Noisy base load with a mild day/night swing (a router, a TV on standby, a freezer chest). */
    private static double[] baseLoad(SplittableRandom r) {
        double[] d = new double[SLOTS_PER_DAY];
        double drift = r.nextDouble(-3, 3);
        for (int i = 0; i < SLOTS_PER_DAY; i++) {
            double h = i / 12.0;
            double level = 85 + 6 * Math.sin((h - 8) / 24.0 * 2 * Math.PI) + drift;
            d[i] = level + r.nextDouble(-5, 5);
        }
        return d;
    }

    /** Stable 64-bit mixing so that neighbouring (seed, a, b) triples give unrelated streams. */
    private static long mix(long seed, long a, long b) {
        long z = seed * 0x9E3779B97F4A7C15L + a * 0xBF58476D1CE4E5B9L + b * 0x94D049BB133111EBL;
        z = (z ^ (z >>> 30)) * 0xBF58476D1CE4E5B9L;
        z = (z ^ (z >>> 27)) * 0x94D049BB133111EBL;
        return z ^ (z >>> 31);
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
