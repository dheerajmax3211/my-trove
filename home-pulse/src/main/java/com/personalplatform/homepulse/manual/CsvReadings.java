package com.personalplatform.homepulse.manual;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/**
 * Pure: parses a {@code timestamp,watts} file (one reading per line, an optional header line). Either every row is
 * valid or the whole file is refused with the first problems listed, so a half-imported file can never happen.
 */
public final class CsvReadings {

    /** Rows per import. Bigger exports are split by the owner. */
    public static final int MAX_ROWS = 10_000;

    /** Same bound the device ingest accepts. */
    static final double MAX_WATTS = 1_000_000;

    private static final int MAX_PROBLEMS_SHOWN = 5;

    public record Row(Instant ts, double watts) {}

    private CsvReadings() {}

    /** @throws IllegalArgumentException with a readable list of the problems, line by line */
    public static List<Row> parse(String csv) {
        List<Row> rows = new ArrayList<>();
        List<String> problems = new ArrayList<>();
        String[] lines = csv.split("\r?\n", -1);
        boolean firstContentLine = true;
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            int lineNo = i + 1;
            if (line.isEmpty()) {
                continue;
            }
            if (firstContentLine) {
                firstContentLine = false;
                // ISO timestamps start with a digit; a header starts with a letter ("timestamp,watts").
                if (Character.isLetter(line.charAt(0))) {
                    continue;
                }
            }
            if (rows.size() + problems.size() >= MAX_ROWS) {
                throw new IllegalArgumentException("A file can hold at most " + MAX_ROWS + " readings. Import it in parts");
            }
            String[] cells = line.split(",", -1);
            if (cells.length != 2) {
                problems.add("line " + lineNo + ": expected two columns, timestamp,watts");
                continue;
            }
            Instant ts = parseInstant(cells[0].trim());
            if (ts == null) {
                problems.add("line " + lineNo + ": the timestamp must be ISO 8601 with a zone, such as 2026-11-19T10:00:00Z");
                continue;
            }
            double watts;
            try {
                watts = Double.parseDouble(cells[1].trim());
            } catch (NumberFormatException e) {
                problems.add("line " + lineNo + ": watts must be a number");
                continue;
            }
            if (!Double.isFinite(watts) || watts < 0 || watts > MAX_WATTS) {
                problems.add("line " + lineNo + ": watts must be between 0 and " + (long) MAX_WATTS);
                continue;
            }
            rows.add(new Row(ts, watts));
        }
        if (!problems.isEmpty()) {
            int shown = Math.min(problems.size(), MAX_PROBLEMS_SHOWN);
            String more = problems.size() > shown ? "; and " + (problems.size() - shown) + " more" : "";
            throw new IllegalArgumentException(
                    "Nothing was imported. " + String.join("; ", problems.subList(0, shown)) + more);
        }
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("The file has no readings. Each line needs a timestamp and watts, such as 2026-11-19T10:00:00Z,118.4");
        }
        return rows;
    }

    /** Offsets (+01:00) and Z are both accepted. A timestamp without a zone is refused, not guessed. */
    static Instant parseInstant(String text) {
        try {
            return OffsetDateTime.parse(text).toInstant();
        } catch (DateTimeParseException e) {
            try {
                return Instant.parse(text);
            } catch (DateTimeParseException e2) {
                return null;
            }
        }
    }
}
