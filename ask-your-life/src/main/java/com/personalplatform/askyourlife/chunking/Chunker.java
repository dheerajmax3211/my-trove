package com.personalplatform.askyourlife.chunking;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pure, deterministic, sentence- and paragraph-aware chunker.
 *
 * <p>Tokens: a token is a whitespace-delimited run, except that every CJK ideograph / kana is its own token
 * (those scripts have no spaces, so counting words would hide a huge chunk). Counting is by code point, so
 * surrogate pairs are never split.
 *
 * <p>Algorithm: split into paragraphs (blank lines), split each paragraph into sentences (after . ! ? ... followed
 * by whitespace, after full-width CJK terminators, and at every line break; locale independent so results never
 * depend on JVM data), cut any single sentence longer than {@code maxTokens} into disjoint {@code maxTokens} pieces at token
 * boundaries, then greedily pack segments into chunks of at most {@code maxTokens}. A chunk is flushed early at a
 * paragraph boundary when it is already at least 60% full and the next paragraph would not fit in what is left.
 * Each following chunk starts with the trailing whole sentences of its predecessor that fit within
 * {@code overlapTokens} (overlap is sentence-granular, so it can be smaller than requested, and is zero when the
 * last sentence alone exceeds it). Chunk text is a verbatim, trimmed slice of the input.
 */
public final class Chunker {

    private static final Pattern PARAGRAPH_BREAK = Pattern.compile("\\R\\s*\\R");
    private static final double SOFT_FLUSH_FILL = 0.6;

    private final int maxTokens;
    private final int overlapTokens;

    public Chunker(int maxTokens, int overlapTokens) {
        if (maxTokens < 1) {
            throw new IllegalArgumentException("maxTokens must be >= 1");
        }
        if (overlapTokens < 0 || overlapTokens >= maxTokens) {
            throw new IllegalArgumentException("overlapTokens must be in [0, maxTokens)");
        }
        this.maxTokens = maxTokens;
        this.overlapTokens = overlapTokens;
    }

    public int maxTokens() {
        return maxTokens;
    }

    public int overlapTokens() {
        return overlapTokens;
    }

    public List<TextChunk> chunk(String text) {
        if (text == null || text.isBlank()) {
            return List.of();
        }
        List<Segment> segments = segment(text);
        if (segments.isEmpty()) {
            return List.of();
        }
        int[] paragraphTokens = paragraphTotals(segments);

        List<TextChunk> out = new ArrayList<>();
        int start = 0;
        int n = segments.size();
        while (start < n) {
            int end = start;
            int tokens = 0;
            while (end < n && tokens + segments.get(end).tokens <= maxTokens) {
                if (end > start && startsNewParagraph(segments, end)
                        && tokens >= SOFT_FLUSH_FILL * maxTokens
                        && paragraphTokens[segments.get(end).paragraph] > maxTokens - tokens) {
                    break;
                }
                tokens += segments.get(end).tokens;
                end++;
            }
            out.add(new TextChunk(out.size(), text.substring(segments.get(start).start, segments.get(end - 1).end).strip(), tokens));
            if (end >= n) {
                break;
            }
            // overlap: back up over whole trailing segments of this chunk while they fit in the overlap budget
            int next = end;
            int overlap = 0;
            while (next - 1 > start && overlap + segments.get(next - 1).tokens <= overlapTokens) {
                next--;
                overlap += segments.get(next).tokens;
            }
            // the overlap plus the next segment must still fit in one chunk
            while (next < end && overlap + segments.get(end).tokens > maxTokens) {
                overlap -= segments.get(next).tokens;
                next++;
            }
            start = next;
        }
        return out;
    }

    /**
     * The sentences of {@code text} exactly as the chunker splits them (terminators, closers, line breaks, CJK
     * full stops), each a verbatim trimmed slice. Used to pick answer sentences out of a chunk.
     */
    public static List<String> sentences(String text) {
        if (text == null || text.isBlank()) {
            return List.of();
        }
        return new Chunker(Integer.MAX_VALUE, 0).segment(text).stream()
                .map(seg -> text.substring(seg.start, seg.end).strip())
                .filter(t -> !t.isEmpty())
                .toList();
    }

    /** Token count using the same rules the chunker applies. */
    public static int countTokens(String text) {
        return tokenSpans(text, 0, text.length()).size();
    }

    // ---- segmentation -------------------------------------------------------------------------------------

    private record Segment(int start, int end, int tokens, int paragraph) {}

    private static boolean startsNewParagraph(List<Segment> segments, int index) {
        return segments.get(index).paragraph != segments.get(index - 1).paragraph;
    }

    private static int[] paragraphTotals(List<Segment> segments) {
        int[] totals = new int[segments.get(segments.size() - 1).paragraph + 1];
        for (Segment s : segments) {
            totals[s.paragraph] += s.tokens;
        }
        return totals;
    }

    private List<Segment> segment(String text) {
        List<Segment> segments = new ArrayList<>();
        Matcher m = PARAGRAPH_BREAK.matcher(text);
        int paragraph = 0;
        int from = 0;
        while (m.find()) {
            addParagraph(text, from, m.start(), paragraph++, segments);
            from = m.end();
        }
        addParagraph(text, from, text.length(), paragraph, segments);
        return segments;
    }

    private void addParagraph(String text, int from, int to, int paragraph, List<Segment> out) {
        int start = from;
        int i = from;
        while (i < to) {
            int cp = text.codePointAt(i);
            int len = Character.charCount(cp);
            int end = -1;
            if (cp == '\n') {
                end = i; // a line break always ends a sentence (lists, headings, verse)
                i += len;
            } else if (isTerminator(cp)) {
                int j = i + len;
                while (j < to && isTerminator(text.codePointAt(j))) {
                    j += Character.charCount(text.codePointAt(j));
                }
                while (j < to && isCloser(text.codePointAt(j))) {
                    j += Character.charCount(text.codePointAt(j));
                }
                boolean spaceOrEnd = j >= to || Character.isWhitespace(text.codePointAt(j));
                boolean fullWidth = Character.UnicodeScript.of(cp) == Character.UnicodeScript.HAN
                        || cp == 0x3002 || cp == 0xFF01 || cp == 0xFF1F;
                if (spaceOrEnd || fullWidth) {
                    end = j;
                }
                i = j;
            } else {
                i += len;
            }
            if (end >= 0) {
                addSentence(text, start, end, paragraph, out);
                start = i;
            }
        }
        addSentence(text, start, to, paragraph, out);
    }

    private static boolean isTerminator(int cp) {
        return cp == '.' || cp == '!' || cp == '?' || cp == 0x2026 || cp == 0x3002 || cp == 0xFF01 || cp == 0xFF1F
                || cp == 0x203C || cp == 0x0964 || cp == 0x061F;
    }

    private static boolean isCloser(int cp) {
        return cp == '"' || cp == '\'' || cp == ')' || cp == ']' || cp == '}' || cp == 0x201D || cp == 0x2019
                || cp == 0x00BB || cp == 0x300D || cp == 0xFF09;
    }

    private void addSentence(String text, int from, int to, int paragraph, List<Segment> out) {
        List<int[]> spans = tokenSpans(text, from, to);
        if (spans.isEmpty()) {
            return;
        }
        if (spans.size() <= maxTokens) {
            out.add(new Segment(spans.get(0)[0], spans.get(spans.size() - 1)[1], spans.size(), paragraph));
            return;
        }
        for (int i = 0; i < spans.size(); i += maxTokens) {
            int last = Math.min(i + maxTokens, spans.size()) - 1;
            out.add(new Segment(spans.get(i)[0], spans.get(last)[1], last - i + 1, paragraph));
        }
    }

    // ---- tokenisation -------------------------------------------------------------------------------------

    private static List<int[]> tokenSpans(String text, int from, int to) {
        List<int[]> spans = new ArrayList<>();
        int i = from;
        int runStart = -1;
        while (i < to) {
            int cp = text.codePointAt(i);
            int len = Character.charCount(cp);
            if (Character.isWhitespace(cp) || Character.isSpaceChar(cp)) {
                if (runStart >= 0) {
                    spans.add(new int[] {runStart, i});
                    runStart = -1;
                }
            } else if (isUnspacedScript(cp)) {
                if (runStart >= 0) {
                    spans.add(new int[] {runStart, i});
                    runStart = -1;
                }
                spans.add(new int[] {i, i + len});
            } else if (runStart < 0) {
                runStart = i;
            }
            i += len;
        }
        if (runStart >= 0) {
            spans.add(new int[] {runStart, to});
        }
        return spans;
    }

    private static boolean isUnspacedScript(int cp) {
        Character.UnicodeScript script = Character.UnicodeScript.of(cp);
        return script == Character.UnicodeScript.HAN
                || script == Character.UnicodeScript.HIRAGANA
                || script == Character.UnicodeScript.KATAKANA;
    }
}
