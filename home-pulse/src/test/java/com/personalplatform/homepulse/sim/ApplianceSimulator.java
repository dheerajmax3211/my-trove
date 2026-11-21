package com.personalplatform.homepulse.sim;

import com.personalplatform.homepulse.detect.MinuteSample;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.function.ToDoubleFunction;

/**
 * Deterministic synthetic power-draw generator at 1-minute resolution (what the continuous aggregate yields).
 * Same seed, same data. Models enough real-world texture that a naive threshold detector would raise false
 * alarms: diurnal ambient swing, day-to-day weather, per-minute sensor noise, door-open events, random sample
 * dropouts and (optionally) gradual compressor degradation.
 */
public final class ApplianceSimulator {

    /** Excess fraction of ON power (and cycle length) as a function of time, 0.0 = healthy. */
    public interface Degradation extends ToDoubleFunction<Instant> {
        Degradation NONE = t -> 0.0;

        /** Linear ramp: 0 at {@code onset}, {@code perDay} more every day after that. */
        static Degradation ramp(Instant onset, double perDay) {
            return t -> t.isBefore(onset) ? 0.0 : Duration.between(onset, t).toMinutes() / 1440.0 * perDay;
        }
    }

    private ApplianceSimulator() {}

    /** Domestic fridge: compressor ~115 W, ~24 min on / ~45 min off, 2.5 W standby. */
    public static List<MinuteSample> fridge(Instant start, int days, long seed, Degradation degradation) {
        return fridge(start, days, seed, degradation, t -> 0.8 * degradation.applyAsDouble(t));
    }

    /**
     * @param powerExcess excess fraction of ON power over time
     * @param runExcess   excess fraction of ON-run length over time (e.g. a refrigerant leak: same power, longer runs)
     */
    public static List<MinuteSample> fridge(Instant start, int days, long seed, Degradation powerExcess,
                                            Degradation runExcess) {
        Random rnd = new Random(seed);
        List<MinuteSample> out = new ArrayList<>(days * 1440);
        boolean on = false;
        int remaining = 20;
        double[] weather = weather(days + 1, rnd, 0.04);
        int extraOn = 0;
        for (int m = 0; m < days * 1440; m++) {
            Instant t = start.plusSeconds(60L * m);
            double deg = powerExcess.applyAsDouble(t);
            double runDeg = runExcess.applyAsDouble(t);
            double hour = hourOfDay(t);
            double demand = (1 + 0.25 * Math.sin(2 * Math.PI * (hour - 9) / 24.0)) * weather[m / 1440];
            if (rnd.nextDouble() < 3.0 / 1440) {
                extraOn += 6;                                        // door opened: next run is longer
            }
            if (remaining <= 0) {
                on = !on;
                if (on) {
                    remaining = (int) Math.max(8, Math.round((24 + 3 * rnd.nextGaussian()) * demand * (1 + runDeg)) + extraOn);
                    extraOn = 0;
                } else {
                    remaining = (int) Math.max(15, Math.round((45 + 6 * rnd.nextGaussian()) / demand));
                }
            }
            remaining--;
            if (rnd.nextDouble() < 0.003) {
                continue;                                            // sample dropout
            }
            double watts = on ? 115 * (1 + deg) * (1 + 0.015 * rnd.nextGaussian())
                    : Math.max(0, 2.5 + 0.2 * rnd.nextGaussian());
            out.add(new MinuteSample(t, watts));
        }
        return out;
    }

    /** Split AC compressor: ~950 W, cycles only when it is warm outside, 1.2 W standby otherwise. */
    public static List<MinuteSample> airConditioner(Instant start, int days, long seed, Degradation degradation) {
        Random rnd = new Random(seed);
        List<MinuteSample> out = new ArrayList<>(days * 1440);
        double[] weather = weather(days + 1, rnd, 1.0);
        boolean on = false;
        int remaining = 10;
        for (int m = 0; m < days * 1440; m++) {
            Instant t = start.plusSeconds(60L * m);
            double deg = degradation.applyAsDouble(t);
            double temp = 30 + 6 * Math.sin(2 * Math.PI * (hourOfDay(t) - 9) / 24.0) + (weather[m / 1440] - 1.0);
            double demand = Math.max(0, Math.min(1, (temp - 26) / 8));
            boolean cooling = demand > 0.1;
            if (remaining <= 0) {
                if (cooling) {
                    on = !on;
                    remaining = on
                            ? (int) Math.round((10 + 20 * demand) * (1 + 0.5 * deg) + rnd.nextGaussian())
                            : (int) Math.round(25 - 15 * demand + rnd.nextGaussian());
                } else {
                    on = false;
                    remaining = 10;
                }
                remaining = Math.max(remaining, 5);
            }
            remaining--;
            if (!cooling && on && remaining < 0) {
                on = false;
            }
            if (rnd.nextDouble() < 0.003) {
                continue;
            }
            double watts = on && cooling
                    ? 950 * (1 + deg) * (1 + 0.03 * (temp - 30) / 6.0) * (1 + 0.015 * rnd.nextGaussian())
                    : Math.max(0, 1.2 + 0.1 * rnd.nextGaussian());
            out.add(new MinuteSample(t, watts));
        }
        return out;
    }

    // ---------------------------------------------------------------- fault injection (post-processing)

    /** Replaces every sample in [from, to) with a constant ON-level draw: the unit never switches off. */
    public static List<MinuteSample> stuckOn(List<MinuteSample> in, Instant from, Instant to, double watts, long seed) {
        Random rnd = new Random(seed);
        return in.stream().map(s -> inside(s, from, to)
                ? new MinuteSample(s.ts(), watts * (1 + 0.01 * rnd.nextGaussian())) : s).toList();
    }

    /** Appliance reads ~0 W in [from, to) while the sensor keeps reporting (unplugged load / dead compressor). */
    public static List<MinuteSample> dead(List<MinuteSample> in, Instant from, Instant to) {
        return in.stream().map(s -> inside(s, from, to) ? new MinuteSample(s.ts(), 0.0) : s).toList();
    }

    /** Sensor goes silent: samples in [from, to) are missing. */
    public static List<MinuteSample> silence(List<MinuteSample> in, Instant from, Instant to) {
        return in.stream().filter(s -> !inside(s, from, to)).toList();
    }

    public static List<MinuteSample> upTo(List<MinuteSample> in, Instant exclusiveEnd) {
        return in.stream().filter(s -> s.ts().isBefore(exclusiveEnd)).toList();
    }

    private static boolean inside(MinuteSample s, Instant from, Instant to) {
        return !s.ts().isBefore(from) && s.ts().isBefore(to);
    }

    private static double hourOfDay(Instant t) {
        var z = t.atZone(ZoneOffset.UTC);
        return z.getHour() + z.getMinute() / 60.0;
    }

    private static double[] weather(int days, Random rnd, double sigma) {
        double[] w = new double[days];
        for (int i = 0; i < days; i++) {
            w[i] = 1.0 + sigma * rnd.nextGaussian();
            if (sigma < 0.5) {
                w[i] = Math.max(0.8, w[i]);   // multiplicative weather factor must stay sane
            }
        }
        return w;
    }
}
