package com.personalplatform.askyourlife.chunking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class ChunkerTest {

    private static String sentences(int count, int wordsEach, String prefix) {
        return IntStream.range(0, count)
                .mapToObj(i -> IntStream.range(0, wordsEach)
                        .mapToObj(w -> prefix + i + "w" + w)
                        .collect(Collectors.joining(" ")) + ".")
                .collect(Collectors.joining(" "));
    }

    @Test
    void emptyAndBlankInputYieldNoChunks() {
        Chunker c = new Chunker(50, 10);
        assertThat(c.chunk(null)).isEmpty();
        assertThat(c.chunk("")).isEmpty();
        assertThat(c.chunk("   \n\n \t ")).isEmpty();
    }

    @Test
    void shortTextIsOneChunkEqualToTheTrimmedInput() {
        List<TextChunk> chunks = new Chunker(50, 10).chunk("  Hello world. This is short.  ");
        assertThat(chunks).hasSize(1);
        assertThat(chunks.get(0).text()).isEqualTo("Hello world. This is short.");
        assertThat(chunks.get(0).tokens()).isEqualTo(5);
        assertThat(chunks.get(0).ordinal()).isZero();
    }

    @Test
    void noChunkEverExceedsMaxTokensAndOrdinalsAreSequential() {
        for (int max : new int[] {5, 17, 40, 100}) {
            Chunker c = new Chunker(max, max / 4);
            String text = sentences(60, 7, "a") + "\n\n" + sentences(30, 23, "b") + "\n\n" + sentences(3, 250, "c");
            List<TextChunk> chunks = c.chunk(text);
            assertThat(chunks).isNotEmpty();
            for (int i = 0; i < chunks.size(); i++) {
                assertThat(chunks.get(i).ordinal()).isEqualTo(i);
                assertThat(chunks.get(i).tokens()).isBetween(1, max);
                assertThat(Chunker.countTokens(chunks.get(i).text())).isEqualTo(chunks.get(i).tokens());
            }
        }
    }

    @Test
    void everyWordOfTheInputAppearsInSomeChunk() {
        String text = sentences(40, 9, "x") + "\n\n" + sentences(12, 31, "y");
        List<TextChunk> chunks = new Chunker(30, 8).chunk(text);
        String joined = chunks.stream().map(TextChunk::text).collect(Collectors.joining("\n"));
        for (String word : text.split("\\s+")) {
            assertThat(joined).contains(word.replace(".", ""));
        }
    }

    @Test
    void consecutiveChunksOverlapOnWholeTrailingSentences() {
        // 10 sentences of 6 tokens; max 20 => 3 sentences (18) per chunk; overlap 6 => exactly one sentence repeated
        String text = sentences(10, 6, "s");
        List<TextChunk> chunks = new Chunker(20, 6).chunk(text);
        assertThat(chunks.size()).isGreaterThan(2);
        for (int i = 1; i < chunks.size(); i++) {
            String prev = chunks.get(i - 1).text();
            String lastSentenceOfPrev = prev.substring(prev.lastIndexOf(". ") + 2);
            assertThat(chunks.get(i).text()).startsWith(lastSentenceOfPrev);
        }
        // and the overlap is bounded by the budget
        for (int i = 1; i < chunks.size(); i++) {
            String prev = chunks.get(i - 1).text();
            String cur = chunks.get(i).text();
            int shared = 0;
            for (String sentence : prev.split("(?<=\\.) ")) {
                if (cur.startsWith(sentence) || cur.contains(sentence)) {
                    shared += Chunker.countTokens(sentence);
                }
            }
            assertThat(shared).isLessThanOrEqualTo(6);
        }
    }

    @Test
    void zeroOverlapProducesDisjointChunks() {
        String text = sentences(12, 5, "d");
        List<TextChunk> chunks = new Chunker(15, 0).chunk(text);
        int total = chunks.stream().mapToInt(TextChunk::tokens).sum();
        assertThat(total).isEqualTo(60);
    }

    @Test
    void overlapWiderThanAnySentenceIsDroppedRatherThanBreakingTheLimit() {
        // sentences of 8 tokens, overlap budget 5 (< one sentence): no overlap, still progresses and respects max
        List<TextChunk> chunks = new Chunker(17, 5).chunk(sentences(9, 8, "o"));
        assertThat(chunks).allSatisfy(ch -> assertThat(ch.tokens()).isLessThanOrEqualTo(17));
        assertThat(chunks.stream().mapToInt(TextChunk::tokens).sum()).isEqualTo(72);
    }

    @Test
    void aSingleHugeSentenceIsCutAtTokenBoundaries() {
        String huge = IntStream.range(0, 95).mapToObj(i -> "tok" + i).collect(Collectors.joining(" ")); // no period
        List<TextChunk> chunks = new Chunker(30, 5).chunk(huge);
        assertThat(chunks).extracting(TextChunk::tokens).containsExactly(30, 30, 30, 5);
        assertThat(chunks.get(0).text()).startsWith("tok0 ").endsWith("tok29");
        assertThat(chunks.get(1).text()).startsWith("tok30 ");
    }

    @Test
    void paragraphBoundaryFlushesAWellFilledChunkInsteadOfSplittingTheNextParagraph() {
        // para A = 7 tokens, para B = 6 tokens, max 10: A fills 70% (>= 60%) and B does not fit in the remaining 3,
        // so B starts a fresh chunk intact instead of being split mid-paragraph
        String a = "a1 a2 a3. a4 a5 a6 a7.";
        String b = "b1 b2 b3. b4 b5 b6.";
        List<TextChunk> chunks = new Chunker(10, 0).chunk(a + "\n\n" + b);
        assertThat(chunks).hasSize(2);
        assertThat(chunks.get(0).text()).isEqualTo(a);
        assertThat(chunks.get(1).text()).isEqualTo(b);
    }

    @Test
    void isDeterministic() {
        String text = sentences(50, 11, "z") + "\n\n" + sentences(5, 90, "q");
        Chunker c = new Chunker(40, 10);
        assertThat(c.chunk(text)).isEqualTo(c.chunk(text));
        assertThat(new Chunker(40, 10).chunk(text)).isEqualTo(c.chunk(text));
    }

    @Test
    void lineEndingsDoNotChangeTheChunking() {
        String unix = "One two three. Four five six.\n\nSeven eight nine. Ten.";
        String windows = unix.replace("\n", "\r\n");
        assertThat(new Chunker(6, 0).chunk(windows).stream().map(TextChunk::tokens).toList())
                .isEqualTo(new Chunker(6, 0).chunk(unix).stream().map(TextChunk::tokens).toList());
    }

    @Test
    void cjkTextIsCountedPerCharacterSoItIsActuallySplit() {
        String cjk = "今日は天気がいいです。".repeat(30); // no spaces anywhere
        List<TextChunk> chunks = new Chunker(25, 0).chunk(cjk);
        assertThat(chunks.size()).isGreaterThan(5);
        assertThat(chunks).allSatisfy(ch -> assertThat(ch.tokens()).isLessThanOrEqualTo(25));
    }

    @Test
    void surrogatePairsAreNeverSplit() {
        String emoji = "😀"; // grinning face, one code point, two chars
        String text = (emoji + emoji + emoji + " ").repeat(40);
        List<TextChunk> chunks = new Chunker(7, 2).chunk(text);
        assertThat(chunks).isNotEmpty();
        for (TextChunk ch : chunks) {
            assertThat(ch.text().codePoints().allMatch(cp -> cp != 0xFFFD)).isTrue();
            // every char in the chunk is part of a well-formed pair: re-encoding is lossless
            assertThat(new String(ch.text().getBytes(java.nio.charset.StandardCharsets.UTF_8),
                    java.nio.charset.StandardCharsets.UTF_8)).isEqualTo(ch.text());
        }
    }

    @Test
    void combiningMarksAndRtlTextSurvive() {
        String text = "Café au lait. שלום עולם. مرحبا بالعالم.";
        List<TextChunk> chunks = new Chunker(100, 10).chunk(text);
        assertThat(chunks).hasSize(1);
        assertThat(chunks.get(0).text()).isEqualTo(text);
    }

    @Test
    void constructorRejectsNonsenseLimits() {
        assertThatThrownBy(() -> new Chunker(0, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new Chunker(10, 10)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new Chunker(10, -1)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void sentencesAreSplitLikeTheChunkerSplitsThem() {
        org.assertj.core.api.Assertions.assertThat(Chunker.sentences(
                "Rent is 950. Due on the 1st!\nPaid by card (see \"note\"). Rate 3.1 percent.\n\nNew paragraph"))
                .containsExactly("Rent is 950.", "Due on the 1st!", "Paid by card (see \"note\").", "Rate 3.1 percent.",
                        "New paragraph");
        org.assertj.core.api.Assertions.assertThat(Chunker.sentences("  ")).isEmpty();
    }
}
