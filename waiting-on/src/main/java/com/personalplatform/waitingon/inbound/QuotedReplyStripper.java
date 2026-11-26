package com.personalplatform.waitingon.inbound;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Keeps only the new part of an email reply: cuts at the first quoted-history marker (Gmail / Apple "On ... wrote:",
 * Outlook "-----Original Message-----" or its From/Sent header block, forwarded-message markers), at a signature
 * delimiter or a mobile-client footer, and drops {@code >} quote lines. Heuristic by nature; pinned by
 * {@code QuotedReplyStripperTest} with real-world shaped bodies. If stripping would leave nothing, the original text is
 * kept instead (a reply that is all quote is still evidence).
 */
public final class QuotedReplyStripper {

    /** Longest reply body kept; the classifier and the timeline excerpt only need the first part. */
    public static final int MAX_CHARS = 10_000;

    private static final Pattern ATTRIBUTION = Pattern.compile(
            "(?i)^(On\\b.{0,300}\\bwrote:|Le\\b.{0,300}\\ba écrit ?:|Am\\b.{0,300}\\bschrieb\\b.{0,200}:)$");
    private static final Pattern SEPARATOR = Pattern.compile(
            "(?i)^(-{2,}\\s*(Original Message|Forwarded message|Weitergeleitete Nachricht)\\s*-{2,}|_{10,}|Begin forwarded message:)$");
    private static final Pattern HEADER_FROM = Pattern.compile("(?i)^\\*?From:\\*?\\s.+");
    private static final Pattern HEADER_SENT = Pattern.compile("(?i)^\\*?(Sent|Date):\\*?\\s.+");
    private static final Pattern FOOTER = Pattern.compile(
            "(?i)^(Sent from my (iPhone|iPad|Android|Galaxy|Samsung|BlackBerry|mobile|phone)\\b.*|Sent from (Mail|Outlook|Yahoo Mail|Gmail)( for \\w+.*)?|Get Outlook for \\w+.*)$");
    private static final int HEADER_LOOKAHEAD = 4;

    private QuotedReplyStripper() {
    }

    public static String strip(String text) {
        if (text == null) {
            return "";
        }
        String[] lines = text.replace("\r\n", "\n").replace('\r', '\n').split("\n", -1);
        List<String> kept = new ArrayList<>();
        for (int i = 0; i < lines.length; i++) {
            String raw = lines[i];
            String line = raw.strip();
            if (startsHistory(lines, i, line) || raw.equals("-- ") || line.equals("--") || FOOTER.matcher(line).matches()) {
                break;
            }
            if (line.startsWith(">")) {
                continue;
            }
            kept.add(line);
        }
        String result = tidy(kept);
        if (result.isEmpty()) {
            result = text.strip();
        }
        return result.length() > MAX_CHARS ? result.substring(0, MAX_CHARS) : result;
    }

    private static boolean startsHistory(String[] lines, int i, String line) {
        if (SEPARATOR.matcher(line).matches() || ATTRIBUTION.matcher(line).matches()) {
            return true;
        }
        if (line.regionMatches(true, 0, "On ", 0, 3) && i + 1 < lines.length
                && ATTRIBUTION.matcher(line + " " + lines[i + 1].strip()).matches()) {
            return true; // Gmail wraps a long attribution over two lines
        }
        if (HEADER_FROM.matcher(line).matches()) {
            for (int j = i + 1; j < Math.min(lines.length, i + 1 + HEADER_LOOKAHEAD); j++) {
                if (HEADER_SENT.matcher(lines[j].strip()).matches()) {
                    return true; // Outlook's quoted header block: From: / Sent: (or Date:) / To: / Subject:
                }
            }
        }
        return false;
    }

    /** Joins lines, collapses runs of blank lines to one, trims. */
    private static String tidy(List<String> lines) {
        StringBuilder sb = new StringBuilder();
        boolean blankPending = false;
        for (String l : lines) {
            if (l.isEmpty()) {
                blankPending = sb.length() > 0;
                continue;
            }
            if (sb.length() > 0) {
                sb.append(blankPending ? "\n\n" : "\n");
            }
            sb.append(l);
            blankPending = false;
        }
        return sb.toString();
    }
}
