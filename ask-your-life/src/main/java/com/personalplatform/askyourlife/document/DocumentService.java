package com.personalplatform.askyourlife.document;

import com.personalplatform.askyourlife.config.IngestProperties;
import com.personalplatform.askyourlife.extract.TextExtractors;
import com.personalplatform.askyourlife.ingest.JobRepository;
import com.personalplatform.askyourlife.web.ApiException;
import com.personalplatform.sql.UuidV7;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ingestion front door. Writing a document and enqueueing its indexing job is one transaction (outbox pattern).
 *
 * <ul>
 *   <li>Same owner + same content hash: no new row, the existing document is returned (idempotent).
 *   <li>Same owner + same {@code externalId} + new content: the document is updated in place and re-queued;
 *       its old chunks stay searchable until the worker atomically swaps in the new ones.
 * </ul>
 */
@Service
public class DocumentService {

    public enum Outcome { CREATED, UPDATED, DUPLICATE }

    public record IngestResult(Outcome outcome, Document document) {}

    public record NewContent(
            String title, SourceType sourceType, String mimeType, byte[] data, Charset charset, String externalId) {}

    private static final int TITLE_MAX = 500;

    private final DocumentRepository documents;
    private final JobRepository jobs;
    private final TextExtractors extractors;
    private final IngestProperties props;
    private final Clock clock;

    public DocumentService(DocumentRepository documents, JobRepository jobs, TextExtractors extractors,
            IngestProperties props, Clock clock) {
        this.documents = documents;
        this.jobs = jobs;
        this.extractors = extractors;
        this.props = props;
        this.clock = clock;
    }

    @Transactional
    public IngestResult ingest(String ownerUid, NewContent in) {
        Extracted x = extract(in.mimeType(), in.data(), in.charset());
        String title = titleFor(in.title(), x.text());
        String externalId = in.externalId() == null || in.externalId().isBlank() ? null : in.externalId().strip();
        SourceType type = in.sourceType() == null ? SourceType.NOTE : in.sourceType();
        Instant now = clock.instant();

        var sameContent = documents.findByHash(ownerUid, x.hash());
        if (externalId != null) {
            var existing = documents.findByExternalId(ownerUid, externalId);
            if (existing.isPresent()) {
                Document doc = existing.get();
                if (doc.contentHash().equals(x.hash())) {
                    return new IngestResult(Outcome.DUPLICATE, doc);
                }
                if (sameContent.isPresent()) {
                    throw ApiException.conflict("Another document of yours already has exactly this content");
                }
                return new IngestResult(Outcome.UPDATED, update(ownerUid, doc, title, x, now));
            }
        }
        if (sameContent.isPresent()) {
            return new IngestResult(Outcome.DUPLICATE, sameContent.get());
        }

        Document doc = new Document(UuidV7.next(), ownerUid, type, externalId, title, x.mimeType(), x.hash(),
                DocumentStatus.PENDING, 0, now, now, null);
        if (documents.insertIfAbsent(doc, x.text())) {
            jobs.enqueue(ownerUid, doc.id(), doc.contentHash(), props.maxAttempts(), now);
            return new IngestResult(Outcome.CREATED, doc);
        }
        // lost a race with a concurrent identical request: return what the winner stored
        return documents.findByHash(ownerUid, x.hash())
                .or(() -> externalId == null ? java.util.Optional.empty() : documents.findByExternalId(ownerUid, externalId))
                .map(d -> new IngestResult(Outcome.DUPLICATE, d))
                .orElseThrow(() -> ApiException.conflict("Concurrent ingestion conflict, please retry"));
    }

    @Transactional
    public IngestResult updateContent(String ownerUid, UUID id, String title, String mimeType, byte[] data) {
        Document doc = documents.findById(ownerUid, id).orElseThrow(() -> ApiException.notFound("Document"));
        Extracted x = extract(mimeType == null ? doc.mimeType() : mimeType, data, StandardCharsets.UTF_8);
        if (doc.contentHash().equals(x.hash())) {
            return new IngestResult(Outcome.DUPLICATE, doc);
        }
        if (documents.findByHash(ownerUid, x.hash()).isPresent()) {
            throw ApiException.conflict("Another document of yours already has exactly this content");
        }
        String newTitle = title == null || title.isBlank() ? doc.title() : titleFor(title, x.text());
        return new IngestResult(Outcome.UPDATED, update(ownerUid, doc, newTitle, x, clock.instant()));
    }

    private Document update(String ownerUid, Document doc, String title, Extracted x, Instant now) {
        documents.replaceContent(ownerUid, doc.id(), title, x.mimeType(), x.hash(), x.text(), now);
        jobs.enqueue(ownerUid, doc.id(), x.hash(), props.maxAttempts(), now);
        return documents.findById(ownerUid, doc.id()).orElseThrow();
    }

    @Transactional(readOnly = true)
    public Document get(String ownerUid, UUID id) {
        return documents.findById(ownerUid, id).orElseThrow(() -> ApiException.notFound("Document"));
    }

    @Transactional(readOnly = true)
    public List<Document> list(String ownerUid, SourceType type, int limit, int offset) {
        return documents.list(ownerUid, type, limit, offset);
    }

    @Transactional
    public void delete(String ownerUid, UUID id) {
        if (!documents.delete(ownerUid, id)) {
            throw ApiException.notFound("Document");
        }
    }

    // ---- helpers ---------------------------------------------------------------------------------------

    private record Extracted(String text, String hash, String mimeType) {}

    private Extracted extract(String mimeType, byte[] data, Charset charset) {
        if (data == null || data.length == 0) {
            throw ApiException.badRequest("Document body is empty");
        }
        if (data.length > props.maxBytes()) {
            throw new ApiException(HttpStatus.CONTENT_TOO_LARGE, "Document exceeds " + props.maxBytes() + " bytes");
        }
        String base = TextExtractors.baseType(mimeType);
        String text = extractors.extract(base, data, charset == null ? StandardCharsets.UTF_8 : charset);
        if (text.isBlank()) {
            throw ApiException.badRequest("Document contains no extractable text");
        }
        return new Extracted(text, sha256Hex(text), base);
    }

    static String titleFor(String given, String text) {
        String t = given == null || given.isBlank() ? text.lines().map(String::strip).filter(l -> !l.isEmpty())
                .findFirst().orElse("Untitled") : given.strip();
        t = t.replaceAll("^#+\\s*", "");
        if (t.codePointCount(0, t.length()) > 80 && (given == null || given.isBlank())) {
            t = t.substring(0, t.offsetByCodePoints(0, 80)) + "…";
        }
        return t.length() > TITLE_MAX ? t.substring(0, TITLE_MAX) : t;
    }

    static String sha256Hex(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
