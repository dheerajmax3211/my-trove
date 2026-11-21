package com.personalplatform.shared.file;

import static com.personalplatform.sql.jooq.shared.shared.Tables.FILES;
import static com.personalplatform.sql.jooq.shared.shared.Tables.HOUSEHOLD_MEMBERS;

import com.personalplatform.shared.audit.AuditService;
import com.personalplatform.shared.common.ApiException;
import com.personalplatform.shared.common.Times;
import com.personalplatform.shared.household.HouseholdAccess;
import com.personalplatform.shared.household.Role;
import com.personalplatform.sql.UuidV7;
import com.personalplatform.sql.jooq.shared.shared.tables.records.FilesRecord;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jooq.Condition;
import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FileService {

    private static final Logger LOG = LoggerFactory.getLogger(FileService.class);

    public record FileView(UUID id, String ownerUid, UUID householdId, String name, String contentType, long sizeBytes,
            String sha256, Instant createdAt) {}

    public record DownloadLink(String token, String url, Instant expiresAt) {}

    public record FileContent(FileView file, InputStream data) {}

    private final DSLContext dsl;
    private final Clock clock;
    private final BlobStore blobs;
    private final DownloadTokenService tokens;
    private final HouseholdAccess access;
    private final AuditService audit;

    public FileService(DSLContext dsl, Clock clock, BlobStore blobs, DownloadTokenService tokens,
            HouseholdAccess access, AuditService audit) {
        this.dsl = dsl;
        this.clock = clock;
        this.blobs = blobs;
        this.tokens = tokens;
        this.access = access;
        this.audit = audit;
    }

    /** Streams the bytes into the blob store while computing size and SHA-256, then registers the metadata. */
    @Transactional
    public FileView upload(String uid, UUID householdId, String originalName, String contentType, InputStream data)
            throws IOException {
        if (householdId != null) {
            access.requireMember(uid, householdId);
        }
        UUID id = UuidV7.next();
        String key = "objects/" + id;
        MessageDigest digest = com.personalplatform.shared.common.Hashing.sha256();
        long size;
        try (DigestInputStream in = new DigestInputStream(data, digest)) {
            size = blobs.put(key, in);
        }
        String sha = HexFormat.of().formatHex(digest.digest());
        try {
            dsl.insertInto(FILES)
                    .set(FILES.ID, id)
                    .set(FILES.OWNER_UID, uid)
                    .set(FILES.HOUSEHOLD_ID, householdId)
                    .set(FILES.OBJECT_KEY, key)
                    .set(FILES.ORIGINAL_NAME, sanitizeName(originalName))
                    .set(FILES.CONTENT_TYPE, contentType == null || contentType.isBlank()
                            ? "application/octet-stream" : contentType)
                    .set(FILES.SIZE_BYTES, size)
                    .set(FILES.SHA256, sha)
                    .set(FILES.CREATED_AT, Times.odt(clock.instant()))
                    .execute();
            audit.record(uid, householdId, "file.uploaded", "file", id.toString(),
                    Map.of("name", sanitizeName(originalName), "sizeBytes", size, "sha256", sha));
        } catch (RuntimeException e) {
            blobs.delete(key); // do not leave an unreferenced blob behind if the DB write fails
            throw e;
        }
        return get(uid, id);
    }

    @Transactional(readOnly = true)
    public FileView get(String uid, UUID id) {
        return view(loadVisible(uid, id));
    }

    @Transactional(readOnly = true)
    public List<FileView> list(String uid, UUID householdId) {
        Condition scope;
        if (householdId != null) {
            access.requireMember(uid, householdId);
            scope = FILES.HOUSEHOLD_ID.eq(householdId);
        } else {
            scope = FILES.HOUSEHOLD_ID.isNull().and(FILES.OWNER_UID.eq(uid))
                    .or(FILES.HOUSEHOLD_ID.in(DSL.select(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID)
                            .from(HOUSEHOLD_MEMBERS).where(HOUSEHOLD_MEMBERS.MEMBER_UID.eq(uid))));
        }
        return dsl.selectFrom(FILES).where(scope)
                .orderBy(FILES.CREATED_AT.desc(), FILES.ID.desc())
                .limit(500)
                .fetch(this::view);
    }

    @Transactional
    public void delete(String uid, UUID id) throws IOException {
        FilesRecord f = loadVisible(uid, id);
        if (!f.getOwnerUid().equals(uid)) {
            access.requireRole(uid, f.getHouseholdId(), Role.OWNER);
        }
        dsl.deleteFrom(FILES).where(FILES.ID.eq(id)).execute();
        audit.record(uid, f.getHouseholdId(), "file.deleted", "file", id.toString(), Map.of("name", f.getOriginalName()));
        blobs.delete(f.getObjectKey());
    }

    /** Called when a household is deleted: its files go with it (rows cascade; blobs are removed here). */
    @Transactional
    public void deleteAllForHousehold(UUID householdId) {
        for (String key : dsl.select(FILES.OBJECT_KEY).from(FILES).where(FILES.HOUSEHOLD_ID.eq(householdId))
                .fetch(FILES.OBJECT_KEY)) {
            try {
                blobs.delete(key);
            } catch (IOException e) {
                LOG.warn("Could not delete blob {} of deleted household {}", key, householdId, e);
            }
        }
    }

    /** Only someone who can see the file may mint a link; the link itself is then a bearer capability. */
    @Transactional
    public DownloadLink issueDownloadLink(String uid, UUID id, Duration ttl) {
        FilesRecord f = loadVisible(uid, id);
        DownloadTokenService.Issued issued;
        try {
            issued = tokens.issue(id, ttl);
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest(e.getMessage());
        }
        audit.record(uid, f.getHouseholdId(), "file.download_link_issued", "file", id.toString(),
                Map.of("expiresAt", issued.expiresAt().toString()));
        return new DownloadLink(issued.token(), "/v1/files/download?token=" + issued.token(), issued.expiresAt());
    }

    /** Verifies the token (throws {@link DownloadTokenService.InvalidTokenException}) and opens the blob. */
    @Transactional(readOnly = true)
    public FileContent openWithToken(String token) throws IOException {
        UUID id = tokens.verify(token);
        FilesRecord f = dsl.selectFrom(FILES).where(FILES.ID.eq(id)).fetchOne();
        if (f == null) {
            throw new DownloadTokenService.InvalidTokenException();
        }
        try {
            return new FileContent(view(f), blobs.open(f.getObjectKey()));
        } catch (NoSuchFileException e) {
            throw ApiException.notFound("File content is missing");
        }
    }

    // ---- helpers -------------------------------------------------------------------------------------------

    private FilesRecord loadVisible(String uid, UUID id) {
        FilesRecord f = dsl.selectFrom(FILES).where(FILES.ID.eq(id)).fetchOne();
        if (f == null) {
            throw ApiException.notFound("File not found");
        }
        boolean visible = f.getHouseholdId() == null
                ? f.getOwnerUid().equals(uid)
                : access.isMember(uid, f.getHouseholdId());
        if (!visible) {
            throw ApiException.notFound("File not found");
        }
        return f;
    }

    private FileView view(FilesRecord f) {
        return new FileView(f.getId(), f.getOwnerUid(), f.getHouseholdId(), f.getOriginalName(), f.getContentType(),
                f.getSizeBytes(), f.getSha256(), Times.instant(f.getCreatedAt()));
    }

    static String sanitizeName(String name) {
        if (name == null || name.isBlank()) {
            return "file";
        }
        String base = Path.of("/" + name.replace('\\', '/')).getFileName().toString().replaceAll("[\\p{Cntrl}]", "");
        if (base.isBlank()) {
            return "file";
        }
        return base.length() > 255 ? base.substring(base.length() - 255) : base;
    }
}
