package com.personalplatform.platform.developer;

import static com.personalplatform.sql.jooq.platform.platform.tables.DeveloperAppRedirectUris.DEVELOPER_APP_REDIRECT_URIS;
import static com.personalplatform.sql.jooq.platform.platform.tables.DeveloperApps.DEVELOPER_APPS;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.springframework.stereotype.Repository;

@Repository
public class DeveloperAppRepository {

    /** One app with its redirect URIs. The secret digest itself never leaves the repository. */
    public record Row(UUID id, String ownerUid, String name, String description, String clientId, boolean hasClientSecret,
               OffsetDateTime secretRotatedAt, OffsetDateTime createdAt, OffsetDateTime updatedAt,
               OffsetDateTime revokedAt, List<String> redirectUris) {}

    private final DSLContext dsl;

    DeveloperAppRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    void insert(UUID id, String ownerUid, String name, String description, String clientId, String secretHash,
                OffsetDateTime now, List<String> redirectUris) {
        dsl.insertInto(DEVELOPER_APPS)
                .set(DEVELOPER_APPS.ID, id)
                .set(DEVELOPER_APPS.OWNER_UID, ownerUid)
                .set(DEVELOPER_APPS.NAME, name)
                .set(DEVELOPER_APPS.DESCRIPTION, description)
                .set(DEVELOPER_APPS.CLIENT_ID, clientId)
                .set(DEVELOPER_APPS.CLIENT_SECRET_HASH, secretHash)
                .set(DEVELOPER_APPS.CREATED_AT, now)
                .set(DEVELOPER_APPS.UPDATED_AT, now)
                .execute();
        for (String uri : redirectUris) {
            dsl.insertInto(DEVELOPER_APP_REDIRECT_URIS)
                    .set(DEVELOPER_APP_REDIRECT_URIS.APP_ID, id)
                    .set(DEVELOPER_APP_REDIRECT_URIS.URI, uri)
                    .execute();
        }
    }

    /** Replaces the editable fields; returns empty when the app is not this owner's. */
    Optional<Row> update(UUID id, String ownerUid, String name, String description, List<String> redirectUris, OffsetDateTime now) {
        int changed = dsl.update(DEVELOPER_APPS)
                .set(DEVELOPER_APPS.NAME, name)
                .set(DEVELOPER_APPS.DESCRIPTION, description)
                .set(DEVELOPER_APPS.UPDATED_AT, now)
                .where(DEVELOPER_APPS.ID.eq(id), DEVELOPER_APPS.OWNER_UID.eq(ownerUid))
                .execute();
        if (changed == 0) {
            return Optional.empty();
        }
        dsl.deleteFrom(DEVELOPER_APP_REDIRECT_URIS).where(DEVELOPER_APP_REDIRECT_URIS.APP_ID.eq(id)).execute();
        for (String uri : redirectUris) {
            dsl.insertInto(DEVELOPER_APP_REDIRECT_URIS)
                    .set(DEVELOPER_APP_REDIRECT_URIS.APP_ID, id)
                    .set(DEVELOPER_APP_REDIRECT_URIS.URI, uri)
                    .execute();
        }
        return findOwned(ownerUid, id);
    }

    List<Row> findByOwner(String ownerUid) {
        var rows = dsl.selectFrom(DEVELOPER_APPS)
                .where(DEVELOPER_APPS.OWNER_UID.eq(ownerUid))
                .orderBy(DEVELOPER_APPS.CREATED_AT, DEVELOPER_APPS.ID)
                .fetch();
        return withRedirectUris(rows);
    }

    public Optional<Row> findOwned(String ownerUid, UUID id) {
        return dsl.selectFrom(DEVELOPER_APPS)
                .where(DEVELOPER_APPS.ID.eq(id), DEVELOPER_APPS.OWNER_UID.eq(ownerUid))
                .fetchOptional()
                .map(r -> withRedirectUris(List.of(r)).get(0));
    }

    /** Sets (or, with null, clears) the client secret digest. Returns false when the app is not this owner's. */
    boolean setSecret(UUID id, String ownerUid, String secretHash, OffsetDateTime now) {
        return dsl.update(DEVELOPER_APPS)
                .set(DEVELOPER_APPS.CLIENT_SECRET_HASH, secretHash)
                .set(DEVELOPER_APPS.SECRET_ROTATED_AT, secretHash == null ? null : now)
                .set(DEVELOPER_APPS.UPDATED_AT, now)
                .where(DEVELOPER_APPS.ID.eq(id), DEVELOPER_APPS.OWNER_UID.eq(ownerUid))
                .execute() == 1;
    }

    /** Marks the app revoked. Idempotent: an already revoked app keeps its original revocation time. */
    void markRevoked(UUID id, OffsetDateTime now) {
        dsl.update(DEVELOPER_APPS)
                .set(DEVELOPER_APPS.REVOKED_AT, now)
                .set(DEVELOPER_APPS.UPDATED_AT, now)
                .where(DEVELOPER_APPS.ID.eq(id), DEVELOPER_APPS.REVOKED_AT.isNull())
                .execute();
    }

    /** The stored digest of an app's secret, for the owner only; null when none is set. */
    Optional<String> secretHash(UUID id, String ownerUid) {
        return dsl.select(DEVELOPER_APPS.CLIENT_SECRET_HASH).from(DEVELOPER_APPS)
                .where(DEVELOPER_APPS.ID.eq(id), DEVELOPER_APPS.OWNER_UID.eq(ownerUid))
                .fetchOptional(DEVELOPER_APPS.CLIENT_SECRET_HASH);
    }

    private List<Row> withRedirectUris(List<? extends Record> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        List<UUID> ids = rows.stream().map(r -> r.get(DEVELOPER_APPS.ID)).toList();
        Map<UUID, List<String>> uris = new java.util.HashMap<>();
        dsl.selectFrom(DEVELOPER_APP_REDIRECT_URIS)
                .where(DEVELOPER_APP_REDIRECT_URIS.APP_ID.in(ids))
                .orderBy(DEVELOPER_APP_REDIRECT_URIS.URI)
                .fetch()
                .forEach(u -> uris.computeIfAbsent(u.get(DEVELOPER_APP_REDIRECT_URIS.APP_ID), k -> new ArrayList<>())
                        .add(u.get(DEVELOPER_APP_REDIRECT_URIS.URI)));
        return rows.stream().map(r -> new Row(
                r.get(DEVELOPER_APPS.ID),
                r.get(DEVELOPER_APPS.OWNER_UID),
                r.get(DEVELOPER_APPS.NAME),
                r.get(DEVELOPER_APPS.DESCRIPTION),
                r.get(DEVELOPER_APPS.CLIENT_ID),
                r.get(DEVELOPER_APPS.CLIENT_SECRET_HASH) != null,
                r.get(DEVELOPER_APPS.SECRET_ROTATED_AT),
                r.get(DEVELOPER_APPS.CREATED_AT),
                r.get(DEVELOPER_APPS.UPDATED_AT),
                r.get(DEVELOPER_APPS.REVOKED_AT),
                uris.getOrDefault(r.get(DEVELOPER_APPS.ID), List.of()))).toList();
    }
}
