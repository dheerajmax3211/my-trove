package com.personalplatform.askyourlife.search;

import com.personalplatform.askyourlife.config.SearchProperties;
import com.personalplatform.askyourlife.document.SourceType;
import com.personalplatform.askyourlife.ingest.ChunkRepository;
import com.personalplatform.askyourlife.rls.OwnerScope;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.jooq.ResultQuery;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;

/**
 * Hybrid retrieval in a single SQL statement.
 *
 * <pre>
 * fts  : top-N chunks by ts_rank_cd for websearch_to_tsquery(q)            (GIN index on tsv)
 * sem  : top-N chunks by cosine distance to the query embedding            (HNSW index on embedding)
 * fused: FULL OUTER JOIN of the two on chunk id,
 *        score = 1/(rrfK + fts_rank) + 1/(rrfK + sem_rank)   (a missing side contributes 0)   -- RRF
 * best : keep each document's best chunk; return the top k by score, with ts_headline snippets
 * </pre>
 *
 * Keyword and semantic modes are the same statement with one list removed. Filters (owner, source type, dates)
 * are applied inside each list, before the top-N cut, so filtering never starves a list. The owner predicate is
 * explicit and also enforced by row-level security.
 */
@Repository
public class SearchRepository {

    private static final String HEADLINE_OPTIONS =
            "StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=32, MinWords=12, FragmentDelimiter=\" … \"";

    private final OwnerScope scope;
    private final SearchProperties props;

    public SearchRepository(OwnerScope scope, SearchProperties props) {
        this.scope = scope;
        this.props = props;
    }

    public List<SearchHit> search(String ownerUid, SearchQuery q, float[] queryVector) {
        return scope.call(ownerUid, dsl -> {
            tuneVectorSearch(dsl, q);
            return build(dsl, ownerUid, q, queryVector).fetch(SearchRepository::map);
        });
    }

    /** Full text of the given chunks (owner-scoped; other owners' ids return nothing). */
    public java.util.Map<UUID, String> chunkTexts(String ownerUid, java.util.Collection<UUID> chunkIds) {
        if (chunkIds.isEmpty()) {
            return java.util.Map.of();
        }
        var chunks = com.personalplatform.sql.jooq.ask_life.ask_life.Tables.CHUNKS;
        return scope.call(ownerUid, dsl -> dsl.select(chunks.ID, chunks.CONTENT)
                .from(chunks)
                .where(chunks.OWNER_UID.eq(ownerUid).and(chunks.ID.in(chunkIds)))
                .fetchMap(chunks.ID, chunks.CONTENT));
    }

    /** EXPLAIN of exactly the statement {@link #search} runs (used to verify index usage). */
    public String explain(String ownerUid, SearchQuery q, float[] queryVector, boolean disableSeqScan) {
        return scope.call(ownerUid, dsl -> {
            tuneVectorSearch(dsl, q);
            if (disableSeqScan) {
                dsl.fetch("select set_config('enable_seqscan', 'off', true)");
            }
            String sql = dsl.renderInlined(build(dsl, ownerUid, q, queryVector));
            StringBuilder plan = new StringBuilder();
            dsl.fetch("explain " + sql).forEach(r -> plan.append(r.get(0, String.class)).append('\n'));
            return plan.toString();
        });
    }

    private void tuneVectorSearch(DSLContext dsl, SearchQuery q) {
        if (q.mode() != SearchMode.KEYWORD) {
            // strict_order keeps ranks exact; iterative scan keeps filtered ANN from returning too few rows
            dsl.fetch("select set_config('hnsw.iterative_scan', 'strict_order', true)");
            dsl.fetch("select set_config('hnsw.ef_search', ?, true)", String.valueOf(props.hnswEfSearch()));
        }
    }

    private ResultQuery<Record> build(DSLContext dsl, String ownerUid, SearchQuery q, float[] queryVector) {
        int pool = Math.max(props.candidatePool(), q.k() * 4);
        boolean fts = q.mode() != SearchMode.SEMANTIC;
        boolean sem = q.mode() != SearchMode.KEYWORD;
        String vec = sem ? ChunkRepository.vectorLiteral(queryVector) : null;
        String tsq = "websearch_to_tsquery('english', ?)";

        Sql sql = new Sql();
        sql.add("with ");
        boolean first = true;
        if (fts) {
            sql.add("fts as (select id, document_id, fts_score, row_number() over (order by fts_score desc, id) as rnk from (")
                    .add("select c.id, c.document_id, ts_rank_cd(c.tsv, " + tsq + ", 1) as fts_score from ask_life.chunks c ", q.text())
                    .add("where c.owner_uid = ? and c.tsv @@ " + tsq, ownerUid, q.text());
            filters(sql, q);
            sql.add(" order by fts_score desc, c.id limit " + pool + ") t)");
            first = false;
        }
        if (sem) {
            if (!first) {
                sql.add(", ");
            }
            sql.add("sem as (select id, document_id, sim, row_number() over (order by dist, id) as rnk from (")
                    .add("select c.id, c.document_id, c.embedding <=> cast(? as public.vector) as dist, "
                            + "1 - (c.embedding <=> cast(? as public.vector)) as sim from ask_life.chunks c ", vec, vec)
                    .add("where c.owner_uid = ?", ownerUid);
            filters(sql, q);
            if (props.minSemanticSimilarity() > 0) {
                sql.add(" and 1 - (c.embedding <=> cast(? as public.vector)) >= ?", vec, props.minSemanticSimilarity());
            }
            sql.add(" order by c.embedding <=> cast(? as public.vector) limit " + pool + ") t)", vec);
            first = false;
        }
        int rrf = props.rrfK();
        if (fts && sem) {
            sql.add(", fused as (select coalesce(f.id, s.id) as chunk_id, coalesce(f.document_id, s.document_id) as document_id, f.rnk as fts_rank, s.rnk as sem_rank, "
                    + "f.fts_score, s.sim, coalesce(1.0 / (" + rrf + " + f.rnk), 0) + coalesce(1.0 / (" + rrf
                    + " + s.rnk), 0) as score from fts f full outer join sem s on s.id = f.id)");
        } else if (fts) {
            sql.add(", fused as (select id as chunk_id, document_id, rnk as fts_rank, cast(null as bigint) as sem_rank, fts_score, "
                    + "cast(null as double precision) as sim, 1.0 / (" + rrf + " + rnk) as score from fts)");
        } else {
            sql.add(", fused as (select id as chunk_id, document_id, cast(null as bigint) as fts_rank, rnk as sem_rank, "
                    + "cast(null as real) as fts_score, sim, 1.0 / (" + rrf + " + rnk) as score from sem)");
        }
        sql.add(", best as (select fu.*, row_number() over (partition by fu.document_id "
                + "order by fu.score desc, fu.chunk_id) as doc_rank from fused fu)");
        sql.add(" select b.chunk_id, b.document_id, d.title, d.source_type, d.created_at, c.ordinal, "
                + "ts_headline('english', replace(replace(replace(c.content, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), "
                + tsq + ", '" + HEADLINE_OPTIONS.replace("'", "''") + "') as snippet, "
                + "b.score, b.fts_rank, b.sem_rank, b.fts_score, b.sim "
                + "from best b join ask_life.chunks c on c.id = b.chunk_id "
                + "join ask_life.documents d on d.id = b.document_id "
                + "where b.doc_rank = 1 order by b.score desc, b.chunk_id limit ?", q.text(), q.k());
        return dsl.resultQuery(sql.text(), sql.binds().toArray());
    }

    private static void filters(Sql sql, SearchQuery q) {
        if (!q.sourceTypes().isEmpty()) {
            String marks = String.join(", ", q.sourceTypes().stream().map(t -> "?").toList());
            sql.add(" and c.source_type in (" + marks + ")", q.sourceTypes().stream().map(SourceType::name).sorted().toArray());
        }
        if (q.from() != null) {
            sql.add(" and c.doc_created_at >= cast(? as timestamptz)", q.from().toString());
        }
        if (q.to() != null) {
            sql.add(" and c.doc_created_at < cast(? as timestamptz)", q.to().toString());
        }
    }

    private static SearchHit map(Record r) {
        Integer ftsRank = r.get("fts_rank") == null ? null : ((Number) r.get("fts_rank")).intValue();
        Integer semRank = r.get("sem_rank") == null ? null : ((Number) r.get("sem_rank")).intValue();
        Double ftsScore = r.get("fts_score") == null ? null : ((Number) r.get("fts_score")).doubleValue();
        Double sim = r.get("sim") == null ? null : ((Number) r.get("sim")).doubleValue();
        return new SearchHit(
                r.get("document_id", UUID.class),
                r.get("chunk_id", UUID.class),
                r.get("title", String.class),
                SourceType.valueOf(r.get("source_type", String.class)),
                r.get("created_at", java.time.OffsetDateTime.class).toInstant(),
                r.get("ordinal", Integer.class),
                r.get("snippet", String.class),
                ((Number) r.get("score")).doubleValue(),
                new SearchHit.Explain(ftsRank, semRank, ftsScore, sim));
    }

    /** Tiny helper keeping SQL text and its bind values in the same order. */
    private static final class Sql {
        private final StringBuilder text = new StringBuilder();
        private final List<Object> binds = new ArrayList<>();

        Sql add(String fragment, Object... values) {
            text.append(fragment);
            binds.addAll(List.of(values));
            return this;
        }

        String text() {
            return text.toString();
        }

        List<Object> binds() {
            return binds;
        }
    }
}
