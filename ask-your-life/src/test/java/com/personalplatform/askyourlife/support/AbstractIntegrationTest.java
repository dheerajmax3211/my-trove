package com.personalplatform.askyourlife.support;

import com.personalplatform.askyourlife.document.DocumentService;
import com.personalplatform.askyourlife.document.SourceType;
import com.personalplatform.askyourlife.ingest.IngestionWorker;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;
import org.jooq.DSLContext;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

/** Real Postgres (pgvector image), real migrations, real app role + RLS; background poller off, clock settable. */
@SpringBootTest
@AutoConfigureMockMvc
@Import({PgVectorContainerConfig.class, TestBeans.class})
@TestPropertySource(properties = "app.ingest.scheduler-enabled=false")
public abstract class AbstractIntegrationTest {

    /** Superuser connection (bypasses RLS): for set-up, clean-up and ground-truth assertions only. */
    @Autowired protected DSLContext superDsl;
    @Autowired protected DocumentService documentService;
    @Autowired protected IngestionWorker worker;

    @BeforeEach
    void cleanDatabase() {
        superDsl.execute("truncate ask_life.documents cascade");
        TestBeans.EMBEDDER.reset();
        TestBeans.CLOCK.set(Instant.parse("2026-06-01T12:00:00Z"));
    }

    protected UUID ingest(String owner, String title, String text, SourceType type) {
        return documentService.ingest(owner, new DocumentService.NewContent(
                title, type, "text/plain", text.getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8, null))
                .document().id();
    }

    /** Ingest and run the worker until the queue is empty, so the document is searchable. */
    protected UUID ingestAndIndex(String owner, String title, String text, SourceType type) {
        UUID id = ingest(owner, title, text, type);
        worker.drain(1000);
        return id;
    }

    protected long count(String table) {
        return Q.val(superDsl, "select count(*) from ask_life." + table, Long.class);
    }
}
