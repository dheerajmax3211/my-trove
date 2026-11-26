package com.personalplatform.platform.developer;

import static com.personalplatform.sql.jooq.platform.platform.tables.ApiKeyScopes.API_KEY_SCOPES;
import static com.personalplatform.sql.jooq.platform.platform.tables.ApiKeys.API_KEYS;
import static com.personalplatform.sql.jooq.platform.platform.tables.DeveloperApps.DEVELOPER_APPS;
import static com.personalplatform.sql.jooq.platform.platform.tables.Plans.PLANS;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;
import org.jooq.DSLContext;
import org.jooq.Field;
import org.jooq.Record;
import org.springframework.stereotype.Repository;

@Repository
class ApiKeyRepository {

    /** A stored key. {@code appRevokedAt} is the owning app's revocation, read in the same query. */
    record Row(UUID id, UUID appId, String ownerUid, String name, String keyPrefix, String keyHash, OffsetDateTime createdAt,
               OffsetDateTime lastUsedAt, OffsetDateTime expiresAt, OffsetDateTime revokedAt, OffsetDateTime appRevokedAt,
               List<String> scopes) {}

    private static final String APP_REVOKED = "app_revoked_at";

    /** Every key column plus the owning app's revocation, for the joined reads. */
    private static Field<?>[] columns() {
        return Stream.concat(Arrays.stream(API_KEYS.fields()), Stream.of(DEVELOPER_APPS.REVOKED_AT.as(APP_REVOKED)))
                .toArray(Field<?>[]::new);
    }

    private final DSLContext dsl;

    ApiKeyRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    void insert(UUID id, UUID appId, String ownerUid, String name, String keyPrefix, String keyHash, OffsetDateTime now,
                OffsetDateTime expiresAt, List<String> scopes) {
        dsl.insertInto(API_KEYS)
                .set(API_KEYS.ID, id)
                .set(API_KEYS.APP_ID, appId)
                .set(API_KEYS.OWNER_UID, ownerUid)
                .set(API_KEYS.NAME, name)
                .set(API_KEYS.KEY_PREFIX, keyPrefix)
                .set(API_KEYS.KEY_HASH, keyHash)
                .set(API_KEYS.CREATED_AT, now)
                .set(API_KEYS.EXPIRES_AT, expiresAt)
                .execute();
        for (String scope : scopes) {
            dsl.insertInto(API_KEY_SCOPES).set(API_KEY_SCOPES.KEY_ID, id).set(API_KEY_SCOPES.SCOPE, scope).execute();
        }
    }

    List<Row> findByApp(UUID appId) {
        var rows = dsl.select(columns())
                .from(API_KEYS).join(DEVELOPER_APPS).on(DEVELOPER_APPS.ID.eq(API_KEYS.APP_ID))
                .where(API_KEYS.APP_ID.eq(appId))
                .orderBy(API_KEYS.CREATED_AT, API_KEYS.ID)
                .fetch();
        return toRows(rows);
    }

    /** Non-revoked keys across all of an owner's apps: what the plan limit counts. */
    int countActive(String ownerUid) {
        return dsl.selectCount().from(API_KEYS)
                .where(API_KEYS.OWNER_UID.eq(ownerUid), API_KEYS.REVOKED_AT.isNull())
                .fetchOne(0, int.class);
    }

    Optional<Row> findOwned(String ownerUid, UUID id) {
        return dsl.select(columns())
                .from(API_KEYS).join(DEVELOPER_APPS).on(DEVELOPER_APPS.ID.eq(API_KEYS.APP_ID))
                .where(API_KEYS.ID.eq(id), API_KEYS.OWNER_UID.eq(ownerUid))
                .fetchOptional()
                .map(r -> toRows(List.of(r)).get(0));
    }

    /** Any key by id, whoever owns it: for the internal status check during delegation. */
    Optional<Row> findById(UUID id) {
        return dsl.select(columns())
                .from(API_KEYS).join(DEVELOPER_APPS).on(DEVELOPER_APPS.ID.eq(API_KEYS.APP_ID))
                .where(API_KEYS.ID.eq(id))
                .fetchOptional()
                .map(r -> toRows(List.of(r)).get(0));
    }

    Optional<Row> findByPrefix(String keyPrefix) {
        return dsl.select(columns())
                .from(API_KEYS).join(DEVELOPER_APPS).on(DEVELOPER_APPS.ID.eq(API_KEYS.APP_ID))
                .where(API_KEYS.KEY_PREFIX.eq(keyPrefix))
                .fetchOptional()
                .map(r -> toRows(List.of(r)).get(0));
    }

    /** Marks the key revoked. Idempotent. */
    void revoke(UUID id, OffsetDateTime now) {
        dsl.update(API_KEYS).set(API_KEYS.REVOKED_AT, now)
                .where(API_KEYS.ID.eq(id), API_KEYS.REVOKED_AT.isNull())
                .execute();
    }

    void touchLastUsed(UUID id, OffsetDateTime now) {
        dsl.update(API_KEYS).set(API_KEYS.LAST_USED_AT, now).where(API_KEYS.ID.eq(id)).execute();
    }

    /** The plan's key limit, or empty when the plan is unknown. */
    Optional<Integer> maxApiKeys(String plan) {
        return dsl.select(PLANS.MAX_API_KEYS).from(PLANS).where(PLANS.NAME.eq(plan)).fetchOptional(PLANS.MAX_API_KEYS);
    }

    private List<Row> toRows(List<? extends Record> records) {
        if (records.isEmpty()) {
            return List.of();
        }
        List<UUID> ids = records.stream().map(r -> r.get(API_KEYS.ID)).toList();
        Map<UUID, List<String>> scopes = new HashMap<>();
        dsl.selectFrom(API_KEY_SCOPES).where(API_KEY_SCOPES.KEY_ID.in(ids)).orderBy(API_KEY_SCOPES.SCOPE).fetch()
                .forEach(s -> scopes.computeIfAbsent(s.get(API_KEY_SCOPES.KEY_ID), k -> new ArrayList<>())
                        .add(s.get(API_KEY_SCOPES.SCOPE)));
        return records.stream().map(r -> new Row(
                r.get(API_KEYS.ID),
                r.get(API_KEYS.APP_ID),
                r.get(API_KEYS.OWNER_UID),
                r.get(API_KEYS.NAME),
                r.get(API_KEYS.KEY_PREFIX),
                r.get(API_KEYS.KEY_HASH),
                r.get(API_KEYS.CREATED_AT),
                r.get(API_KEYS.LAST_USED_AT),
                r.get(API_KEYS.EXPIRES_AT),
                r.get(API_KEYS.REVOKED_AT),
                r.get(APP_REVOKED, OffsetDateTime.class),
                scopes.getOrDefault(r.get(API_KEYS.ID), List.of()))).toList();
    }
}
