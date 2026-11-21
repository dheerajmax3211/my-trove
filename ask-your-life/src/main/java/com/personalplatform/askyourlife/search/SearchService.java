package com.personalplatform.askyourlife.search;

import com.personalplatform.askyourlife.config.SearchProperties;
import com.personalplatform.askyourlife.embedding.Embedder;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class SearchService {

    public record Response(String query, SearchMode mode, int k, List<SearchHit> hits, Debug debug) {}

    /** Parameters of the fusion, returned with {@code debug=true} so ranks can be interpreted. */
    public record Debug(int rrfK, String fusion, int candidatePool) {}

    private final SearchRepository repository;
    private final Embedder embedder;
    private final SearchProperties props;

    public SearchService(SearchRepository repository, Embedder embedder, SearchProperties props) {
        this.repository = repository;
        this.embedder = embedder;
        this.props = props;
    }

    public Response search(String ownerUid, SearchQuery q, boolean debug) {
        float[] vector = q.mode() == SearchMode.KEYWORD ? null : embedder.embed(q.text());
        List<SearchHit> hits = repository.search(ownerUid, q, vector);
        if (!debug) {
            hits = hits.stream().map(SearchHit::withoutExplain).toList();
        }
        Debug d = debug
                ? new Debug(props.rrfK(), "score = sum(1 / (rrfK + rank)) over the lists the chunk appears in",
                        Math.max(props.candidatePool(), q.k() * 4))
                : null;
        return new Response(q.text(), q.mode(), q.k(), hits, d);
    }
}
