package com.personalplatform.askyourlife.embedding;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.askyourlife.support.ModelFiles;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * The tokenizer pipeline, first on a tiny hand-written tokenizer.json (no model needed), then on the real
 * potion-base-2M file. Expected WordPiece splits for the real vocabulary were computed independently (a separate
 * greedy longest-match script over the same vocab).
 */
class BertWordPieceTokenizerTest {

    private static final String TINY = """
            {"version":"1.0",
             "added_tokens":[{"id":0,"content":"[PAD]","single_word":false,"lstrip":false,"rstrip":false,"normalized":false,"special":true},
                             {"id":1,"content":"[UNK]","single_word":false,"lstrip":false,"rstrip":false,"normalized":false,"special":true},
                             {"id":2,"content":"[MASK]","single_word":false,"lstrip":false,"rstrip":false,"normalized":false,"special":true}],
             "normalizer":{"type":"BertNormalizer","clean_text":true,"handle_chinese_chars":true,"strip_accents":null,"lowercase":true},
             "pre_tokenizer":{"type":"BertPreTokenizer"},
             "model":{"type":"WordPiece","unk_token":"[UNK]","continuing_subword_prefix":"##","max_input_chars_per_word":10,
                      "vocab":{"[PAD]":0,"[UNK]":1,"[MASK]":2,"cafe":3,"naive":4,"plum":5,"##ber":6,",":7,"!":8,"東":9,"rent":10,"##s":11,"a":12,"b":13}}}
            """;

    private static BertWordPieceTokenizer tiny(Path dir, String json) throws IOException {
        Path f = dir.resolve("tokenizer.json");
        Files.writeString(f, json);
        return BertWordPieceTokenizer.load(f);
    }

    @Test
    void normalizesLowercasesStripsAccentsAndIsolatesPunctuation(@TempDir Path dir) throws IOException {
        BertWordPieceTokenizer t = tiny(dir, TINY);
        assertThat(t.tokenize("Café, NAÏVE!")).containsExactly("cafe", ",", "naive", "!");
        assertThat(t.encode("Café, NAÏVE!")).containsExactly(3, 7, 4, 8);
    }

    @Test
    void greedyLongestMatchWithContinuationPrefix(@TempDir Path dir) throws IOException {
        BertWordPieceTokenizer t = tiny(dir, TINY);
        assertThat(t.tokenize("plumber rents")).containsExactly("plum", "##ber", "rent", "##s");
    }

    @Test
    void aWordWithAnUnmatchedRemainderOrTooLongIsOneUnknownToken(@TempDir Path dir) throws IOException {
        BertWordPieceTokenizer t = tiny(dir, TINY);
        assertThat(t.tokenize("plumbx")).containsExactly("[UNK]");
        assertThat(t.tokenize("aaaaaaaaaaa b")).containsExactly("[UNK]", "b"); // 11 chars > max 10
        assertThat(t.encode("plumbx")).containsExactly(t.unkId());
    }

    @Test
    void cleansControlAndFormatCharactersAndUnicodeWhitespace(@TempDir Path dir) throws IOException {
        BertWordPieceTokenizer t = tiny(dir, TINY);
        // zero-width space (Cf) and NUL are removed; no-break and ideographic spaces split words
        assertThat(t.tokenize("re​nt\u0000s")).containsExactly("rent", "##s");
        assertThat(t.tokenize("a b　a")).containsExactly("a", "b", "a");
    }

    @Test
    void cjkIdeographsAreSeparateWordsAndAddedTokensMatchVerbatim(@TempDir Path dir) throws IOException {
        BertWordPieceTokenizer t = tiny(dir, TINY);
        assertThat(t.tokenize("a東b")).containsExactly("a", "東", "b");
        assertThat(t.tokenize("a[MASK]b")).containsExactly("a", "[MASK]", "b");
        assertThat(t.encode("[mask]")).doesNotContain(2); // added tokens are not normalised: lower case does not match
    }

    @Test
    void refusesATokenizerItDoesNotImplement(@TempDir Path dir) {
        assertThatThrownBy(() -> tiny(dir, TINY.replace("\"WordPiece\"", "\"BPE\"")))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("WordPiece");
        assertThatThrownBy(() -> tiny(dir, TINY.replace("BertPreTokenizer", "Whitespace")))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("pre_tokenizer");
    }

    @Test
    void realPotionTokenizerSplitsLikeTheReferenceAlgorithm() throws IOException {
        ModelFiles.assumePresent();
        BertWordPieceTokenizer t = BertWordPieceTokenizer.load(ModelFiles.dir().resolve("tokenizer.json"));
        assertThat(t.vocabSize()).isEqualTo(29528);
        assertThat(t.tokenize("Hello, World!")).containsExactly("hello", ",", "world", "!");
        assertThat(t.encode("Hello, World!")).containsExactly(6598, 16, 1094, 5);
        assertThat(t.tokenize("Warranty for the dishwasher")).containsExactly(
                "warrant", "##y", "for", "the", "dish", "##wash", "##er");
        assertThat(t.encode("reimbursement")).containsExactly(23970, 13911, 27399, 2678);
        assertThat(t.encode("Plumber")).containsExactly(21094, 4683);
        assertThat(t.encode("☃")).containsExactly(t.unkId());
    }
}
