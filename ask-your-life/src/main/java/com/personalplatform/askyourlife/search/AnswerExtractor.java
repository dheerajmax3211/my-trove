package com.personalplatform.askyourlife.search;

import com.personalplatform.askyourlife.chunking.Chunker;
import com.personalplatform.askyourlife.embedding.Embedder;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Picks the sentence(s) that best answer a question out of the top search results. Extractive only: no generative
 * model (none small enough to run here is useful), so the answer is always a verbatim, cited quote.
 *
 * <p>Candidates are the sentences of the best chunk of each of the top {@link #TOP_HITS} hits. Each is scored
 * {@code 0.5 * cosine(sentence, question) + 0.5 * cosine(its chunk, question) + 0.15 * share of the question's
 * content words it contains - 0.05 * hit rank (0-based)}: the passage-level match is the more reliable signal with
 * static embeddings, the sentence term picks the line inside it. The best one is returned if it scores at least {@code minScore}; a second sentence is added
 * when it scores within {@link #SECOND_WITHIN} of the first (and also clears the bar), so a two-part fact is
 * not cut in half. Below the bar there is no answer, which the UI shows as nothing rather than a guess.
 */
public final class AnswerExtractor {

    static final int TOP_HITS = 3;
    static final int MAX_SENTENCES = 2;
    static final double SECOND_WITHIN = 0.05;
    private static final double SENTENCE_WEIGHT = 0.5;
    private static final double OVERLAP_WEIGHT = 0.15;
    private static final double RANK_PENALTY = 0.05;
    private static final int MAX_SENTENCE_CHARS = 400;

    private static final Set<String> STOPWORDS = Set.of(
            "a", "an", "and", "are", "as", "at", "be", "by", "did", "do", "does", "for", "from", "how", "in", "is",
            "it", "my", "of", "on", "or", "the", "to", "was", "what", "when", "where", "which", "who", "why", "with",
            "i", "me", "we", "our", "you", "your", "this", "that", "much", "many", "last", "new");

    private final Embedder embedder;
    private final double minScore;

    public AnswerExtractor(Embedder embedder, double minScore) {
        this.embedder = embedder;
        this.minScore = minScore;
    }

    private record Candidate(String text, SearchHit hit, int rank) {}

    private record Scored(Candidate c, double score) {}

    /**
     * @param question    the query text
     * @param queryVector its embedding, or null to compute it
     * @param hits        search results, best first
     * @param chunkText   full text of each hit's chunk, by chunk id
     */
    public Answer extract(String question, float[] queryVector, List<SearchHit> hits, Map<UUID, String> chunkText) {
        List<Candidate> candidates = new ArrayList<>();
        for (int r = 0; r < Math.min(TOP_HITS, hits.size()); r++) {
            SearchHit hit = hits.get(r);
            for (String s : Chunker.sentences(chunkText.getOrDefault(hit.chunkId(), ""))) {
                if (s.length() <= MAX_SENTENCE_CHARS && s.codePoints().anyMatch(Character::isLetterOrDigit)) {
                    candidates.add(new Candidate(s, hit, r));
                }
            }
        }
        if (candidates.isEmpty()) {
            return null;
        }
        float[] q = queryVector != null ? queryVector : embedder.embed(question);
        List<float[]> vectors = embedder.embedAll(candidates.stream().map(Candidate::text).toList());
        int shown = Math.min(TOP_HITS, hits.size());
        List<float[]> chunkVectors = embedder.embedAll(hits.subList(0, shown).stream()
                .map(h -> chunkText.getOrDefault(h.chunkId(), "")).toList());
        Set<String> questionWords = contentWords(question);
        List<Scored> scored = new ArrayList<>();
        for (int i = 0; i < candidates.size(); i++) {
            Candidate c = candidates.get(i);
            double score = SENTENCE_WEIGHT * Embedder.cosine(q, vectors.get(i))
                    + (1 - SENTENCE_WEIGHT) * Embedder.cosine(q, chunkVectors.get(c.rank()))
                    + OVERLAP_WEIGHT * overlap(questionWords, contentWords(c.text()))
                    - RANK_PENALTY * c.rank();
            scored.add(new Scored(c, score));
        }
        scored.sort((a, b) -> Double.compare(b.score(), a.score()));
        Scored best = scored.get(0);
        if (best.score() < minScore) {
            return null;
        }
        List<Scored> chosen = new ArrayList<>(List.of(best));
        for (int i = 1; i < scored.size() && chosen.size() < MAX_SENTENCES; i++) {
            Scored s = scored.get(i);
            if (s.score() >= minScore && best.score() - s.score() <= SECOND_WITHIN && !s.c().text().equals(best.c().text())) {
                chosen.add(s);
            }
        }
        List<Answer.Citation> citations = chosen.stream()
                .map(s -> new Answer.Citation(s.c().text(), s.c().hit().documentId(), s.c().hit().title(),
                        s.c().hit().sourceType(), s.c().hit().chunkId(), s.c().hit().chunkOrdinal()))
                .toList();
        String text = String.join(" ", citations.stream().map(Answer.Citation::text).toList());
        return new Answer(text, citations, Math.round(best.score() * 1000) / 1000.0);
    }

    static Set<String> contentWords(String text) {
        Set<String> out = new HashSet<>();
        StringBuilder sb = new StringBuilder();
        String lower = text.toLowerCase(Locale.ROOT) + " ";
        lower.codePoints().forEach(cp -> {
            if (Character.isLetterOrDigit(cp)) {
                sb.appendCodePoint(cp);
            } else {
                if (sb.length() > 1 && !STOPWORDS.contains(sb.toString())) {
                    out.add(sb.toString());
                }
                sb.setLength(0);
            }
        });
        return out;
    }

    private static double overlap(Set<String> question, Set<String> sentence) {
        if (question.isEmpty()) {
            return 0;
        }
        int n = 0;
        for (String w : question) {
            if (sentence.contains(w)) {
                n++;
            }
        }
        return (double) n / question.size();
    }
}
