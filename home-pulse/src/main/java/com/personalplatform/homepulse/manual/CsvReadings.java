package com.personalplatform.homepulse.manual;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Pure: parses a smart-meter or plug export into readings.
 *
 * <p>Format. One row per line. The header is optional; without one the columns are {@code timestamp,watts}. With a
 * header the names decide the columns, in any order and any case:
 *
 * <ul>
 *   <li>{@code timestamp} (also {@code time}, {@code ts}): required, ISO 8601 <b>with a zone</b> (Z or an offset).
 *   <li>{@code watts} <i>or</i> {@code kwh}: exactly one, required. {@code watts} is the power at that moment. {@code kwh}
 *       is the energy used since the previous row, so it becomes average power over that interval. Its first row only
 *       sets the starting time (its energy covers a period before the file). Rows must be at most
 *       {@link #MAX_INTERVAL_MINUTES} apart: a longer interval cannot be placed without inventing readings.
 *   <li>{@code volts} (or {@code voltage}) and {@code amps} (or {@code current}): optional, kept when present.
 * </ul>
 *
 * <p>Either every row is valid or the whole file is refused with the first problems listed, so a half-imported file can
 * never happen.
 */
public final class CsvReadings {

    /** Rows per import. Bigger exports are split by the owner. */
    public static final int MAX_ROWS = 10_000;

    /** Same bound the device ingest accepts. */
    static final double MAX_WATTS = 1_000_000;

    static final double MAX_VOLTS = 1_000;
    static final double MAX_AMPS = 1_000;
    static final double MAX_KWH = 1_000_000_000;

    /**
     * Longest gap between two kWh rows (and between two meter totals). Energy spread over a longer gap would be
     * per-minute readings nobody measured, so such a file or total is refused, or stored as a total only.
     */
    public static final long MAX_INTERVAL_MINUTES = 120;

    private static final int MAX_PROBLEMS_SHOWN = 5;

    private static final Pattern NO_ZONE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?");

    /**
     * One reading. {@code intervalMinutes} is 0 for a reading at {@code ts}; for a kWh row it is the length of the
     * interval ending at {@code ts}, over which {@code watts} is the average.
     */
    public record Row(Instant ts, double watts, Double volts, Double amps, int intervalMinutes) {}

    private enum Unit { WATTS, KWH }

    /** Which column holds what. {@code header} is the text used in messages. */
    private record Columns(int ts, int value, Unit unit, int volts, int amps, int count, String header) {

        static final Columns DEFAULT = new Columns(0, 1, Unit.WATTS, -1, -1, 2, "timestamp,watts");

        static Columns fromHeader(String line) {
            String[] names = line.split(",", -1);
            int ts = -1;
            int watts = -1;
            int kwh = -1;
            int volts = -1;
            int amps = -1;
            List<String> unknown = new ArrayList<>();
            for (int i = 0; i < names.length; i++) {
                String name = names[i].trim();
                switch (name.toLowerCase(Locale.ROOT)) {
                    case "timestamp", "time", "ts" -> ts = place(ts, i, name);
                    case "watts" -> watts = place(watts, i, name);
                    case "kwh" -> kwh = place(kwh, i, name);
                    case "volts", "voltage" -> volts = place(volts, i, name);
                    case "amps", "current" -> amps = place(amps, i, name);
                    default -> unknown.add("'" + name + "'");
                }
            }
            if (!unknown.isEmpty()) {
                throw new IllegalArgumentException("Nothing was imported. The header has unknown column "
                        + String.join(", ", unknown) + ". The columns it understands are timestamp, watts or kwh, volts, amps");
            }
            if (ts < 0) {
                throw new IllegalArgumentException("Nothing was imported. The header needs a timestamp column");
            }
            if (watts >= 0 && kwh >= 0) {
                throw new IllegalArgumentException("Nothing was imported. The header has both watts and kwh: use either watts or kwh, not both");
            }
            if (watts < 0 && kwh < 0) {
                throw new IllegalArgumentException("Nothing was imported. The header needs watts or kwh as its reading column");
            }
            return new Columns(ts, watts >= 0 ? watts : kwh, watts >= 0 ? Unit.WATTS : Unit.KWH, volts, amps,
                    names.length, line.strip());
        }

        private static int place(int existing, int index, String name) {
            if (existing >= 0) {
                throw new IllegalArgumentException("Nothing was imported. The header names the column '" + name + "' twice");
            }
            return index;
        }
    }

    /** A problem with one row; collected per line so the owner sees every line that needs fixing. */
    private static final class RowError extends RuntimeException {
        RowError(String message) {
            super(message, null, false, false);
        }
    }

    private CsvReadings() {}

    /** @throws IllegalArgumentException with a readable list of the problems, line by line */
    public static List<Row> parse(String csv) {
        List<Row> rows = new ArrayList<>();
        List<String> problems = new ArrayList<>();
        String[] lines = csv.split("\r?\n", -1);
        Columns columns = null;
        Instant previous = null;
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            int lineNo = i + 1;
            if (line.isEmpty()) {
                continue;
            }
            if (columns == null) {
                // ISO timestamps start with a digit; a header starts with a letter ("timestamp,watts").
                if (Character.isLetter(line.charAt(0))) {
                    columns = Columns.fromHeader(line);
                    continue;
                }
                columns = Columns.DEFAULT;
            }
            if (rows.size() + problems.size() >= MAX_ROWS) {
                throw new IllegalArgumentException("A file can hold at most " + MAX_ROWS + " readings. Import it in parts");
            }
            String[] cells = line.split(",", -1);
            if (cells.length != columns.count()) {
                problems.add("line " + lineNo + ": expected " + columns.count() + " columns, as in " + columns.header());
                continue;
            }
            try {
                Instant ts = timestamp(cells[columns.ts()].trim());
                Double volts = columns.volts() < 0 ? null : number(cells[columns.volts()], "volts", 0, MAX_VOLTS);
                Double amps = columns.amps() < 0 ? null : number(cells[columns.amps()], "amps", 0, MAX_AMPS);
                if (columns.unit() == Unit.WATTS) {
                    rows.add(new Row(ts, number(cells[columns.value()], "watts", 0, MAX_WATTS), volts, amps, 0));
                } else {
                    double kwh = number(cells[columns.value()], "kwh", 0, MAX_KWH);
                    Row row = energyRow(ts, kwh, previous, volts, amps);
                    if (row != null) {
                        rows.add(row);
                    }
                }
                previous = ts;
            } catch (RowError e) {
                problems.add("line " + lineNo + ": " + e.getMessage());
            }
        }
        if (!problems.isEmpty()) {
            int shown = Math.min(problems.size(), MAX_PROBLEMS_SHOWN);
            String more = problems.size() > shown ? "; and " + (problems.size() - shown) + " more" : "";
            throw new IllegalArgumentException(
                    "Nothing was imported. " + String.join("; ", problems.subList(0, shown)) + more);
        }
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("The file has no readings. Each line needs a timestamp and watts (or kwh), "
                    + "such as 2026-11-19T10:00:00Z,118.4. A kWh file needs at least two rows");
        }
        return rows;
    }

    /**
     * The average-power row for energy used since {@code previous}, or null for the very first kWh row (it only sets
     * the starting time). Times are compared to the minute, the resolution readings are stored at.
     */
    private static Row energyRow(Instant ts, double kwh, Instant previous, Double volts, Double amps) {
        if (previous == null) {
            return null;
        }
        Instant minute = ts.truncatedTo(ChronoUnit.MINUTES);
        Instant previousMinute = previous.truncatedTo(ChronoUnit.MINUTES);
        if (!minute.isAfter(previousMinute)) {
            throw new RowError("kWh rows must be later than the row before (" + previous + ")");
        }
        long minutes = Duration.between(previousMinute, minute).toMinutes();
        if (minutes > MAX_INTERVAL_MINUTES) {
            throw new RowError("the interval since the previous row is " + describe(minutes)
                    + "; kWh rows must be at most " + describe(MAX_INTERVAL_MINUTES) + " apart, so export more often");
        }
        double watts = ManualReadingsService.averageWatts(kwh, minutes);
        if (watts > MAX_WATTS) {
            throw new RowError("kwh is more than " + (long) MAX_WATTS + " watts could draw over " + describe(minutes));
        }
        return new Row(minute, watts, volts, amps, (int) minutes);
    }

    private static String describe(long minutes) {
        return minutes % 60 == 0 ? (minutes / 60) + " hours" : minutes + " minutes";
    }

    private static double number(String text, String name, double min, double max) {
        double value;
        try {
            value = Double.parseDouble(text.trim());
        } catch (NumberFormatException e) {
            throw new RowError(name + " must be a number");
        }
        if (!Double.isFinite(value) || value < min || value > max) {
            throw new RowError(name + " must be between " + (long) min + " and " + (long) max);
        }
        return value;
    }

    /**
     * Offsets (+01:00) and Z are both accepted. A timestamp without a zone is refused, not guessed: the message says
     * the zone is missing, so the owner knows exactly what to add.
     */
    static Instant timestamp(String text) {
        try {
            return OffsetDateTime.parse(text).toInstant();
        } catch (DateTimeParseException e) {
            try {
                return Instant.parse(text);
            } catch (DateTimeParseException e2) {
                if (NO_ZONE.matcher(text).matches()) {
                    throw new RowError("the timestamp has no time zone. Add Z or an offset such as +01:00, "
                            + "for example 2031-01-15T10:00:00Z");
                }
                throw new RowError("the timestamp is not ISO 8601, for example 2031-01-15T10:00:00Z");
            }
        }
    }
}
