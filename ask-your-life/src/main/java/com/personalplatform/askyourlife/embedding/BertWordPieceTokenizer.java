package com.personalplatform.askyourlife.embedding;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Pure-Java implementation of the Hugging Face {@code tokenizers} pipeline that a Model2Vec {@code tokenizer.json}
 * describes, limited to exactly what that file uses and refusing anything else:
 *
 * <ol>
 *   <li><b>added tokens</b> ({@code normalized: false}): exact occurrences in the raw text are split out first;
 *   <li><b>normalizer</b> {@code BertNormalizer}: clean_text (drop NUL, U+FFFD and Unicode "Other" characters except
 *       tab/CR/LF, map Unicode White_Space to a space), handle_chinese_chars (spaces around CJK ideographs),
 *       strip_accents (NFD then drop non-spacing marks; when null it follows {@code lowercase}), lowercase;
 *   <li><b>pre-tokenizer</b> {@code BertPreTokenizer}: split on whitespace (removed) and isolate every punctuation
 *       character (ASCII punctuation or Unicode P* categories);
 *   <li><b>model</b> {@code WordPiece}: greedy longest-match-first with the continuing-subword prefix; a word longer
 *       than {@code max_input_chars_per_word} or with an unmatched remainder becomes one {@code unk_token}.
 * </ol>
 *
 * The post-processor (CLS/SEP template) is not applied: Model2Vec encodes with {@code add_special_tokens=False}.
 */
public final class BertWordPieceTokenizer {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final Map<String, Integer> vocab;
    private final List<String> addedTokens; // longest first, so a longer token wins at the same position
    private final Map<String, Integer> addedIds;
    private final String unkToken;
    private final int unkId;
    private final String prefix;
    private final int maxCharsPerWord;
    private final boolean cleanText;
    private final boolean handleChineseChars;
    private final boolean stripAccents;
    private final boolean lowercase;

    private BertWordPieceTokenizer(JsonNode root) {
        JsonNode normalizer = root.path("normalizer");
        require("BertNormalizer".equals(normalizer.path("type").asString("")),
                "normalizer must be BertNormalizer, was " + normalizer.path("type"));
        cleanText = normalizer.path("clean_text").asBoolean(true);
        handleChineseChars = normalizer.path("handle_chinese_chars").asBoolean(true);
        lowercase = normalizer.path("lowercase").asBoolean(true);
        JsonNode strip = normalizer.path("strip_accents");
        stripAccents = strip.isMissingNode() || strip.isNull() ? lowercase : strip.asBoolean();

        require("BertPreTokenizer".equals(root.path("pre_tokenizer").path("type").asString("")),
                "pre_tokenizer must be BertPreTokenizer, was " + root.path("pre_tokenizer").path("type"));

        JsonNode model = root.path("model");
        require("WordPiece".equals(model.path("type").asString("")), "model must be WordPiece, was " + model.path("type"));
        unkToken = model.path("unk_token").asString("[UNK]");
        prefix = model.path("continuing_subword_prefix").asString("##");
        maxCharsPerWord = model.path("max_input_chars_per_word").asInt(100);
        vocab = new HashMap<>();
        model.path("vocab").properties().forEach(e -> vocab.put(e.getKey(), e.getValue().asInt()));
        require(!vocab.isEmpty(), "vocabulary is empty");
        Integer unk = vocab.get(unkToken);
        require(unk != null, "unk_token " + unkToken + " is not in the vocabulary");
        unkId = unk;

        addedIds = new HashMap<>();
        for (JsonNode t : root.path("added_tokens")) {
            require(!t.path("normalized").asBoolean(false) && !t.path("single_word").asBoolean(false)
                    && !t.path("lstrip").asBoolean(false) && !t.path("rstrip").asBoolean(false),
                    "added token options other than exact, un-normalised matching are not supported: " + t);
            addedIds.put(t.path("content").asString(), t.path("id").asInt());
        }
        addedTokens = addedIds.keySet().stream().sorted(Comparator.comparingInt(String::length).reversed()).toList();
    }

    public static BertWordPieceTokenizer load(Path tokenizerJson) throws IOException {
        try (InputStream in = Files.newInputStream(tokenizerJson)) {
            return new BertWordPieceTokenizer(JSON.readTree(in));
        }
    }

    public int unkId() {
        return unkId;
    }

    public int vocabSize() {
        return vocab.size();
    }

    /** Token ids, without special tokens (CLS/SEP are not added). Unknown pieces are {@link #unkId()}. */
    public List<Integer> encode(String text) {
        List<Integer> ids = new ArrayList<>();
        for (String token : tokenize(text)) {
            Integer added = addedIds.get(token);
            ids.add(added != null ? added : vocab.getOrDefault(token, unkId));
        }
        return ids;
    }

    /** The token strings (useful for tests): added tokens verbatim, then WordPiece pieces. */
    public List<String> tokenize(String text) {
        List<String> out = new ArrayList<>();
        if (text == null || text.isEmpty()) {
            return out;
        }
        int start = 0;
        int i = 0;
        while (i < text.length()) {
            String match = addedTokenAt(text, i);
            if (match != null) {
                tokenizeSegment(text.substring(start, i), out);
                out.add(match);
                i += match.length();
                start = i;
            } else {
                i++;
            }
        }
        tokenizeSegment(text.substring(start), out);
        return out;
    }

    private String addedTokenAt(String text, int i) {
        for (String t : addedTokens) {
            if (text.startsWith(t, i)) {
                return t;
            }
        }
        return null;
    }

    private void tokenizeSegment(String segment, List<String> out) {
        if (segment.isEmpty()) {
            return;
        }
        for (String word : preTokenize(normalize(segment))) {
            wordPiece(word, out);
        }
    }

    // ---- normalizer -------------------------------------------------------------------------------------

    String normalize(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        s.codePoints().forEach(cp -> {
            if (cleanText) {
                if (cp == 0 || cp == 0xFFFD || isControl(cp)) {
                    return;
                }
                if (isWhitespace(cp)) {
                    sb.append(' ');
                    return;
                }
            }
            if (handleChineseChars && isChineseChar(cp)) {
                sb.append(' ').appendCodePoint(cp).append(' ');
                return;
            }
            sb.appendCodePoint(cp);
        });
        String r = sb.toString();
        if (stripAccents) {
            StringBuilder stripped = new StringBuilder(r.length());
            Normalizer.normalize(r, Normalizer.Form.NFD).codePoints()
                    .filter(cp -> Character.getType(cp) != Character.NON_SPACING_MARK)
                    .forEach(stripped::appendCodePoint);
            r = stripped.toString();
        }
        if (lowercase) {
            // per code point, like Rust's char::to_lowercase (no context-sensitive final sigma)
            StringBuilder lower = new StringBuilder(r.length());
            r.codePoints().forEach(cp -> lower.append(new String(Character.toChars(cp)).toLowerCase(Locale.ROOT)));
            r = lower.toString();
        }
        return r;
    }

    /** Rust {@code char::is_whitespace} = Unicode White_Space (plus tab/LF/CR, already included). */
    static boolean isWhitespace(int cp) {
        return (cp >= 0x09 && cp <= 0x0D) || cp == 0x20 || cp == 0x85 || cp == 0xA0 || cp == 0x1680
                || (cp >= 0x2000 && cp <= 0x200A) || cp == 0x2028 || cp == 0x2029 || cp == 0x202F || cp == 0x205F
                || cp == 0x3000;
    }

    /** Unicode category "Other" (Cc, Cf, Cn, Co, Cs), except tab, LF and CR. */
    static boolean isControl(int cp) {
        if (cp == '\t' || cp == '\n' || cp == '\r') {
            return false;
        }
        int t = Character.getType(cp);
        return t == Character.CONTROL || t == Character.FORMAT || t == Character.UNASSIGNED
                || t == Character.PRIVATE_USE || t == Character.SURROGATE;
    }

    static boolean isChineseChar(int cp) {
        return (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0x20000 && cp <= 0x2A6DF)
                || (cp >= 0x2A700 && cp <= 0x2B73F) || (cp >= 0x2B740 && cp <= 0x2B81F)
                || (cp >= 0x2B920 && cp <= 0x2CEAF) || (cp >= 0xF900 && cp <= 0xFAFF)
                || (cp >= 0x2F800 && cp <= 0x2FA1F);
    }

    // ---- pre-tokenizer ----------------------------------------------------------------------------------

    static List<String> preTokenize(String s) {
        List<String> words = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        s.codePoints().forEach(cp -> {
            if (isWhitespace(cp)) {
                flush(cur, words);
            } else if (isPunctuation(cp)) {
                flush(cur, words);
                words.add(new String(Character.toChars(cp)));
            } else {
                cur.appendCodePoint(cp);
            }
        });
        flush(cur, words);
        return words;
    }

    private static void flush(StringBuilder cur, List<String> words) {
        if (!cur.isEmpty()) {
            words.add(cur.toString());
            cur.setLength(0);
        }
    }

    static boolean isPunctuation(int cp) {
        if (cp < 128) {
            return (cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) || (cp >= 91 && cp <= 96) || (cp >= 123 && cp <= 126);
        }
        int t = Character.getType(cp);
        return t == Character.CONNECTOR_PUNCTUATION || t == Character.DASH_PUNCTUATION
                || t == Character.START_PUNCTUATION || t == Character.END_PUNCTUATION
                || t == Character.INITIAL_QUOTE_PUNCTUATION || t == Character.FINAL_QUOTE_PUNCTUATION
                || t == Character.OTHER_PUNCTUATION;
    }

    // ---- WordPiece --------------------------------------------------------------------------------------

    private void wordPiece(String word, List<String> out) {
        int[] cps = word.codePoints().toArray();
        if (cps.length > maxCharsPerWord) {
            out.add(unkToken);
            return;
        }
        List<String> pieces = new ArrayList<>();
        int start = 0;
        while (start < cps.length) {
            int end = cps.length;
            String found = null;
            while (start < end) {
                String sub = new String(cps, start, end - start);
                if (start > 0) {
                    sub = prefix + sub;
                }
                if (vocab.containsKey(sub)) {
                    found = sub;
                    break;
                }
                end--;
            }
            if (found == null) {
                out.add(unkToken);
                return;
            }
            pieces.add(found);
            start = end;
        }
        out.addAll(pieces);
    }

    private static void require(boolean ok, String message) {
        if (!ok) {
            throw new IllegalArgumentException("unsupported tokenizer.json: " + message);
        }
    }
}
