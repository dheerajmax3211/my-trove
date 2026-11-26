package com.personalplatform.askyourlife.search;

import com.personalplatform.askyourlife.config.SearchProperties;
import com.personalplatform.askyourlife.embedding.Embedder;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class SearchService {

    /**
     * @param answer extractive answer quoted from the top hits, with citations; absent when nothing clears the bar
     *               or when it was not requested
     */
    public record Response(String query, SearchMode mode, int k, Answer answer, List<SearchHit> hits, Debug debug) {}

    /** Parameters of the fusion, returned with {@code debug=true} so ranks can be interpreted. */
    public record Debug(int rrfK, String fusion, int candidatePool) {}

    private final SearchRepository repository;
    private final Embedder embedder;
    private final SearchProperties props;

    private final AnswerExtractor answers;

    public SearchService(SearchRepository repository, Embedder embedder, SearchProperties props) {
        this.repository = repository;
        this.embedder = embedder;
        this.props = props;
        this.answers = new AnswerExtractor(embedder, props.answerMinScore());
    }

    public Response search(String ownerUid, SearchQuery q, boolean debug) {
        return search(ownerUid, q, debug, false);
    }

    public Response search(String ownerUid, SearchQuery q, boolean debug, boolean withAnswer) {
        float[] vector = q.mode() == SearchMode.KEYWORD ? null : embedder.embed(q.text());
        List<SearchHit> hits = repository.search(ownerUid, q, vector);
        Answer answer = null;
        if (withAnswer && !hits.isEmpty()) {
            var top = hits.subList(0, Math.min(AnswerExtractor.TOP_HITS, hits.size()));
            answer = answers.extract(q.text(), vector, top,
                    repository.chunkTexts(ownerUid, top.stream().map(SearchHit::chunkId).toList()));
        }
        if (!debug) {
            hits = hits.stream().map(SearchHit::withoutExplain).toList();
        }
        Debug d = debug
                ? new Debug(props.rrfK(), "score = sum(1 / (rrfK + rank)) over the lists the chunk appears in",
                        Math.max(props.candidatePool(), q.k() * 4))
                : null;
        return new Response(q.text(), q.mode(), q.k(), answer, hits, d);
    }
}
