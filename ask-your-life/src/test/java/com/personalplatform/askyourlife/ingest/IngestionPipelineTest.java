package com.personalplatform.askyourlife.ingest;

import com.personalplatform.askyourlife.support.Q;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.askyourlife.chunking.TextChunk;
import com.personalplatform.askyourlife.config.IngestProperties;
import com.personalplatform.askyourlife.document.Document;
import com.personalplatform.askyourlife.document.DocumentService;
import com.personalplatform.askyourlife.document.DocumentStatus;
import com.personalplatform.askyourlife.document.SourceType;
import com.personalplatform.askyourlife.embedding.HashingEmbedder;
import com.personalplatform.askyourlife.support.AbstractIntegrationTest;
import com.personalplatform.askyourlife.support.TestBeans;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class IngestionPipelineTest extends AbstractIntegrationTest {

    @Autowired JobRepository jobs;
    @Autowired ChunkRepository chunkRepository;
    @Autowired com.personalplatform.askyourlife.document.DocumentRepository documents;
    @Autowired com.personalplatform.askyourlife.chunking.Chunker chunker;
    @Autowired com.personalplatform.askyourlife.embedding.Embedder embedder;
    @Autowired com.personalplatform.askyourlife.rls.OwnerScope scope;
    @Autowired IngestProperties props;

    private DocumentService.IngestResult post(String owner, String text, String externalId) {
        return documentService.ingest(owner, new DocumentService.NewContent("t", SourceType.NOTE, "text/plain",
                text.getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8, externalId));
    }

    private static String longText(String word, int paragraphs) {
        return IntStream.range(0, paragraphs)
                .mapToObj(i -> "Paragraph " + i + " about " + word + ". It has a second sentence with more " + word + " words to fill space.")
                .collect(java.util.stream.Collectors.joining("\n\n"));
    }

    private String jobStatus(UUID docId) {
        return Q.val(superDsl, "select status from ask_life.ingestion_jobs where document_id = ? order by created_at desc, id desc limit 1", String.class, docId);
    }

    // ---- happy path / dedupe -----------------------------------------------------------------------------

    @Test
    void ingestWritesDocumentAndJobAtomicallyThenWorkerIndexesIt() {
        var r = post("alice", longText("kiwi", 30), null);
        assertThat(r.outcome()).isEqualTo(DocumentService.Outcome.CREATED);
        assertThat(r.document().status()).isEqualTo(DocumentStatus.PENDING);
        assertThat(count("ingestion_jobs")).isEqualTo(1);
        assertThat(count("chunks")).isZero();

        assertThat(worker.drain(10)).isEqualTo(1);

        Document d = documentService.get("alice", r.document().id());
        assertThat(d.status()).isEqualTo(DocumentStatus.INDEXED);
        assertThat(d.chunkCount()).isGreaterThan(1).isEqualTo((int) count("chunks"));
        assertThat(d.ingestedAt()).isEqualTo(TestBeans.CLOCK.instant());
        assertThat(jobStatus(d.id())).isEqualTo("DONE");
        // stored vectors are real 384-d and tsv is populated by the database
        assertThat(Q.val(superDsl, "select vector_dims(embedding) from ask_life.chunks limit 1", Integer.class)).isEqualTo(384);
        assertThat(Q.val(superDsl, "select count(*) from ask_life.chunks where tsv @@ to_tsquery('english','kiwi')", Long.class))
                .isEqualTo(count("chunks"));
    }

    @Test
    void identicalContentIsIdempotentPerOwner() {
        var first = post("alice", "same words here", null);
        var second = post("alice", "same words here", null);
        var third = post("alice", "same words here\r\n", null); // normalises to the same text
        assertThat(second.outcome()).isEqualTo(DocumentService.Outcome.DUPLICATE);
        assertThat(third.outcome()).isEqualTo(DocumentService.Outcome.DUPLICATE);
        assertThat(second.document().id()).isEqualTo(first.document().id());
        assertThat(count("documents")).isEqualTo(1);
        assertThat(count("ingestion_jobs")).isEqualTo(1);

        worker.drain(10);
        assertThat(post("alice", "same words here", null).outcome()).isEqualTo(DocumentService.Outcome.DUPLICATE);
        assertThat(count("ingestion_jobs")).isEqualTo(1); // re-posting indexed content does not re-queue

        // another owner may hold the same text: dedupe is per owner
        var bob = post("bob", "same words here", null);
        assertThat(bob.outcome()).isEqualTo(DocumentService.Outcome.CREATED);
        assertThat(bob.document().id()).isNotEqualTo(first.document().id());
    }

    @Test
    void concurrentIdenticalPostsCreateExactlyOneDocument() throws Exception {
        int n = 8;
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<DocumentService.IngestResult>> futures = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            futures.add(pool.submit(() -> {
                go.await();
                return post("alice", "race condition text", null);
            }));
        }
        go.countDown();
        List<UUID> ids = new ArrayList<>();
        int created = 0;
        for (var f : futures) {
            var r = f.get(30, TimeUnit.SECONDS);
            ids.add(r.document().id());
            if (r.outcome() == DocumentService.Outcome.CREATED) {
                created++;
            }
        }
        pool.shutdown();
        assertThat(created).isEqualTo(1);
        assertThat(ids.stream().distinct()).hasSize(1);
        assertThat(count("documents")).isEqualTo(1);
        assertThat(count("ingestion_jobs")).isEqualTo(1);
    }

    // ---- replace on update ---------------------------------------------------------------------------------

    @Test
    void changedContentReplacesChunksAndOldOnesStayVisibleUntilTheSwap() {
        var v1 = post("alice", longText("apricot", 30), "note-1");
        worker.drain(10);
        UUID id = v1.document().id();
        int oldCount = documentService.get("alice", id).chunkCount();
        assertThat(oldCount).isGreaterThan(1);

        var v2 = post("alice", longText("zucchini", 12), "note-1");
        assertThat(v2.outcome()).isEqualTo(DocumentService.Outcome.UPDATED);
        assertThat(v2.document().id()).isEqualTo(id);
        assertThat(v2.document().status()).isEqualTo(DocumentStatus.PENDING);
        // before the worker runs: old chunks are still there and still searchable
        assertThat(chunkRepository.countForDocument("alice", id)).isEqualTo(oldCount);
        assertThat(Q.val(superDsl, "select count(*) from ask_life.chunks where content like '%apricot%'", Long.class)).isPositive();

        worker.drain(10);
        Document d = documentService.get("alice", id);
        assertThat(d.status()).isEqualTo(DocumentStatus.INDEXED);
        assertThat(d.chunkCount()).isEqualTo((int) count("chunks")).isLessThan(oldCount);
        assertThat(Q.val(superDsl, "select count(*) from ask_life.chunks where content like '%apricot%'", Long.class)).isZero();
        assertThat(Q.val(superDsl, "select count(*) from ask_life.chunks where content like '%zucchini%'", Long.class)).isEqualTo(count("chunks"));
        assertThat(count("documents")).isEqualTo(1);
    }

    @Test
    void ordinalsAreContiguousAfterReplacement() {
        post("alice", longText("one", 25), "x");
        worker.drain(10);
        post("alice", longText("two", 40), "x");
        worker.drain(10);
        var ordinals = Q.vals(superDsl, "select ordinal from ask_life.chunks order by ordinal", Integer.class);
        assertThat(ordinals).isEqualTo(IntStream.range(0, ordinals.size()).boxed().toList());
    }

    @Test
    void aFailingReplacementRollsBackAndLeavesTheOldChunksIntact() {
        var doc = post("alice", longText("pear", 20), null).document();
        worker.drain(10);
        int before = chunkRepository.countForDocument("alice", doc.id());
        assertThat(before).isGreaterThan(1);

        List<TextChunk> bad = List.of(new TextChunk(0, "fine chunk", 2), new TextChunk(1, "invalid token count", 0));
        List<float[]> vectors = new HashingEmbedder(384).embedAll(List.of("fine chunk", "invalid token count"));
        assertThatThrownBy(() -> chunkRepository.replaceChunks("alice", doc.id(), doc.contentHash(), bad, vectors,
                TestBeans.CLOCK.instant())).isInstanceOf(RuntimeException.class);

        assertThat(chunkRepository.countForDocument("alice", doc.id())).isEqualTo(before);
        assertThat(documentService.get("alice", doc.id()).status()).isEqualTo(DocumentStatus.INDEXED);
    }

    @Test
    void readersNeverObserveAPartiallyReplacedChunkSet() throws Exception {
        var doc = post("alice", "seed text for atomicity", null).document();
        worker.drain(10);
        List<TextChunk> small = chunks(3);
        List<TextChunk> large = chunks(9);
        List<float[]> smallV = embedder.embedAll(small.stream().map(TextChunk::text).toList());
        List<float[]> largeV = embedder.embedAll(large.stream().map(TextChunk::text).toList());
        chunkRepository.replaceChunks("alice", doc.id(), doc.contentHash(), small, smallV, TestBeans.CLOCK.instant());

        AtomicBoolean stop = new AtomicBoolean();
        List<Integer> seen = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(3);
        List<Future<?>> readers = new ArrayList<>();
        for (int r = 0; r < 2; r++) {
            readers.add(pool.submit(() -> {
                while (!stop.get()) {
                    seen.add(chunkRepository.countForDocument("alice", doc.id()));
                }
            }));
        }
        for (int i = 0; i < 40; i++) {
            boolean useLarge = i % 2 == 0;
            chunkRepository.replaceChunks("alice", doc.id(), doc.contentHash(), useLarge ? large : small,
                    useLarge ? largeV : smallV, TestBeans.CLOCK.instant());
        }
        stop.set(true);
        for (var f : readers) {
            f.get(30, TimeUnit.SECONDS);
        }
        pool.shutdown();
        assertThat(seen).isNotEmpty();
        assertThat(seen).containsOnly(3, 9);
    }

    private static List<TextChunk> chunks(int n) {
        return IntStream.range(0, n).mapToObj(i -> new TextChunk(i, "chunk number " + i + " of " + n, 6)).toList();
    }

    @Test
    void staleJobsForSupersededContentWriteNothing() {
        var v1 = post("alice", longText("old", 10), "doc");
        var v2 = post("alice", longText("new", 10), "doc"); // second job queued before the first ran
        assertThat(count("ingestion_jobs")).isEqualTo(2);
        worker.drain(10);
        assertThat(TestBeans.EMBEDDER.calls.keySet()).noneMatch(t -> t.contains(" old "));
        assertThat(Q.val(superDsl, "select count(*) from ask_life.chunks where content like '%old%'", Long.class)).isZero();
        assertThat(documentService.get("alice", v2.document().id()).status()).isEqualTo(DocumentStatus.INDEXED);
        assertThat(count("ingestion_jobs") - Q.val(superDsl, "select count(*) from ask_life.ingestion_jobs where status='DONE'", Long.class)).isZero();
    }

    // ---- delete ------------------------------------------------------------------------------------------

    @Test
    void deletingADocumentRemovesChunksAndJobs() {
        var doc = post("alice", longText("fig", 20), null).document();
        worker.drain(10);
        assertThat(count("chunks")).isPositive();
        documentService.delete("alice", doc.id());
        assertThat(count("documents")).isZero();
        assertThat(count("chunks")).isZero();
        assertThat(count("ingestion_jobs")).isZero();
    }

    @Test
    void deletingBeforeTheWorkerRunsLeavesNothingToDo() {
        var doc = post("alice", "short lived", null).document();
        documentService.delete("alice", doc.id());
        assertThat(worker.drain(10)).isZero();
        assertThat(count("chunks")).isZero();
    }

    // ---- retries / dead letter -----------------------------------------------------------------------------

    @Test
    void failedJobsRetryWithExponentialBackoffThenSucceed() {
        var doc = post("alice", "retry me please", null).document();
        TestBeans.EMBEDDER.failuresLeft = 2;

        assertThat(worker.runOnce()).isTrue(); // attempt 1 fails -> retry in 10s
        assertThat(worker.runOnce()).isFalse(); // not due yet (clock is frozen)
        assertThat(jobStatus(doc.id())).isEqualTo("PENDING");
        assertThat(Q.val(superDsl, "select attempts from ask_life.ingestion_jobs", Integer.class)).isEqualTo(1);
        assertThat(Q.val(superDsl, "select last_error from ask_life.ingestion_jobs", String.class)).contains("embedder unavailable");

        TestBeans.CLOCK.advance(Duration.ofSeconds(9));
        assertThat(worker.runOnce()).isFalse();
        TestBeans.CLOCK.advance(Duration.ofSeconds(1));
        assertThat(worker.runOnce()).isTrue(); // attempt 2 fails -> retry in 20s
        TestBeans.CLOCK.advance(Duration.ofSeconds(19));
        assertThat(worker.runOnce()).isFalse();
        TestBeans.CLOCK.advance(Duration.ofSeconds(1));
        assertThat(worker.runOnce()).isTrue(); // attempt 3 succeeds

        assertThat(jobStatus(doc.id())).isEqualTo("DONE");
        assertThat(Q.val(superDsl, "select attempts from ask_life.ingestion_jobs", Integer.class)).isEqualTo(3);
        assertThat(documentService.get("alice", doc.id()).status()).isEqualTo(DocumentStatus.INDEXED);
        assertThat(Q.val(superDsl, "select last_error from ask_life.ingestion_jobs", String.class)).isNull();
    }

    @Test
    void jobsThatKeepFailingAreDeadLetteredAndTheDocumentIsMarkedFailed() {
        var doc = post("alice", "this will never embed", null).document();
        TestBeans.EMBEDDER.failure.set(new IllegalStateException("model is down"));

        for (int attempt = 1; attempt <= props.maxAttempts(); attempt++) {
            assertThat(worker.runOnce()).as("attempt %d", attempt).isTrue();
            TestBeans.CLOCK.advance(props.maxBackoff());
        }
        assertThat(jobStatus(doc.id())).isEqualTo("DEAD");
        assertThat(Q.val(superDsl, "select attempts from ask_life.ingestion_jobs", Integer.class)).isEqualTo(props.maxAttempts());
        assertThat(Q.val(superDsl, "select last_error from ask_life.ingestion_jobs", String.class)).contains("model is down");
        assertThat(documentService.get("alice", doc.id()).status()).isEqualTo(DocumentStatus.FAILED);

        assertThat(worker.runOnce()).isFalse(); // dead letters are never claimed again
        TestBeans.CLOCK.advance(Duration.ofDays(1));
        assertThat(worker.runOnce()).isFalse();
        assertThat(count("chunks")).isZero();
    }

    @Test
    void aCrashedWorkersJobIsTakenOverAfterItsLeaseExpires() {
        var doc = post("alice", "crash recovery text", null).document();
        // a worker claims the job and then "dies": it never completes or fails it
        var claimed = jobs.claim("dead-worker", TestBeans.CLOCK.instant(), props.lease());
        assertThat(claimed).isPresent();
        assertThat(worker.runOnce()).isFalse(); // still leased
        TestBeans.CLOCK.advance(props.lease().plusSeconds(1));
        assertThat(worker.runOnce()).isTrue();
        assertThat(documentService.get("alice", doc.id()).status()).isEqualTo(DocumentStatus.INDEXED);
        assertThat(Q.val(superDsl, "select attempts from ask_life.ingestion_jobs", Integer.class)).isEqualTo(2);
    }

    // ---- concurrency -------------------------------------------------------------------------------------------

    @Test
    void concurrentClaimsNeverHandOutTheSameJobTwice() throws Exception {
        int jobCount = 120;
        for (int i = 0; i < jobCount; i++) {
            post("alice", "claim test document number " + i, null);
        }
        int threads = 8;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<List<UUID>>> futures = new ArrayList<>();
        for (int t = 0; t < threads; t++) {
            String workerName = "w" + t;
            futures.add(pool.submit(() -> {
                go.await();
                List<UUID> mine = new ArrayList<>();
                while (true) {
                    var job = jobs.claim(workerName, TestBeans.CLOCK.instant(), props.lease());
                    if (job.isEmpty()) {
                        return mine;
                    }
                    mine.add(job.get().id());
                }
            }));
        }
        go.countDown();
        List<UUID> all = new ArrayList<>();
        for (var f : futures) {
            all.addAll(f.get(60, TimeUnit.SECONDS));
        }
        pool.shutdown();
        assertThat(all).hasSize(jobCount).doesNotHaveDuplicates();
        assertThat(Q.val(superDsl, "select count(*) from ask_life.ingestion_jobs where status = 'RUNNING' and attempts = 1", Long.class))
                .isEqualTo(jobCount);
    }

    @Test
    void severalWorkersProcessEveryJobExactlyOnce() throws Exception {
        int docs = 40;
        for (int i = 0; i < docs; i++) {
            post(i % 2 == 0 ? "alice" : "bob", "worker race document " + i + " " + longText("topic" + i, 3), null);
        }
        int threads = 4;
        List<IngestionWorker> workers = new ArrayList<>();
        for (int t = 0; t < threads; t++) {
            workers.add(new IngestionWorker(jobs, documents, chunkRepository, chunker, embedder, scope,
                    TestBeans.CLOCK, props));
        }
        assertThat(workers.stream().map(IngestionWorker::workerId).distinct()).hasSize(threads);

        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Integer>> futures = new ArrayList<>();
        for (IngestionWorker w : workers) {
            futures.add(pool.submit(() -> {
                go.await();
                int handled = 0;
                while (w.runOnce()) {
                    handled++;
                }
                return handled;
            }));
        }
        go.countDown();
        int handled = 0;
        for (var f : futures) {
            handled += f.get(120, TimeUnit.SECONDS);
        }
        pool.shutdown();

        assertThat(handled).isEqualTo(docs);
        assertThat(Q.val(superDsl, "select count(*) from ask_life.ingestion_jobs where status = 'DONE' and attempts = 1", Long.class))
                .isEqualTo(docs);
        assertThat(Q.val(superDsl, "select count(*) from ask_life.documents where status = 'INDEXED'", Long.class)).isEqualTo(docs);
        // every chunk text was embedded exactly once in total: no document was processed twice
        assertThat(TestBeans.EMBEDDER.calls.values()).allSatisfy(c -> assertThat(c.get()).isEqualTo(1));
        long chunkRows = count("chunks");
        assertThat(TestBeans.EMBEDDER.calls.size()).isEqualTo((int) chunkRows);
        // and each document has a gap-free ordinal sequence (no duplicated writes interleaved)
        assertThat(Q.val(superDsl, "select count(*) from (select document_id from ask_life.chunks group by document_id "
                + "having max(ordinal) + 1 <> count(*)) t", Long.class)).isZero();
    }
}
