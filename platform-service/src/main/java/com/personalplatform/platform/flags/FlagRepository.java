package com.personalplatform.platform.flags;

import static com.personalplatform.sql.jooq.platform.platform.tables.FeatureFlags.FEATURE_FLAGS;

import com.personalplatform.platform.flags.Dtos.Flag;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;

@Repository
class FlagRepository {

    private final DSLContext dsl;

    FlagRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    List<Flag> findAll() {
        return dsl.selectFrom(FEATURE_FLAGS).orderBy(FEATURE_FLAGS.KEY).fetch(FlagRepository::toFlag);
    }

    /** @return the stored flag, or empty when the key already exists */
    Optional<Flag> insert(Flag f, String actor) {
        return dsl.insertInto(FEATURE_FLAGS)
                .set(FEATURE_FLAGS.KEY, f.key())
                .set(FEATURE_FLAGS.DESCRIPTION, f.description())
                .set(FEATURE_FLAGS.ENABLED, f.enabled())
                .set(FEATURE_FLAGS.ROLLOUT_PERCENT, (short) f.rolloutPercent())
                .set(FEATURE_FLAGS.ALLOWED_PLANS, toArray(f.allowedPlans()))
                .set(FEATURE_FLAGS.ALLOWED_ROLES, toArray(f.allowedRoles()))
                .set(FEATURE_FLAGS.UPDATED_BY, actor)
                .onConflictDoNothing()
                .returning()
                .fetchOptional(FlagRepository::toFlag);
    }

    /** @return the stored flag, or empty when no such key exists */
    Optional<Flag> update(Flag f, String actor) {
        return dsl.update(FEATURE_FLAGS)
                .set(FEATURE_FLAGS.DESCRIPTION, f.description())
                .set(FEATURE_FLAGS.ENABLED, f.enabled())
                .set(FEATURE_FLAGS.ROLLOUT_PERCENT, (short) f.rolloutPercent())
                .set(FEATURE_FLAGS.ALLOWED_PLANS, toArray(f.allowedPlans()))
                .set(FEATURE_FLAGS.ALLOWED_ROLES, toArray(f.allowedRoles()))
                .set(FEATURE_FLAGS.UPDATED_AT, DSL.currentOffsetDateTime())
                .set(FEATURE_FLAGS.UPDATED_BY, actor)
                .where(FEATURE_FLAGS.KEY.eq(f.key()))
                .returning()
                .fetchOptional(FlagRepository::toFlag);
    }

    /** @return the flag as it was, or empty when no such key exists */
    Optional<Flag> delete(String key) {
        return dsl.deleteFrom(FEATURE_FLAGS).where(FEATURE_FLAGS.KEY.eq(key)).returning().fetchOptional(FlagRepository::toFlag);
    }

    /** Append-only (a trigger refuses update, delete and truncate). {@code detailJson} is the flag as written or removed. */
    void audit(String key, String action, String actor, String detailJson) {
        dsl.execute("insert into platform.flag_audit (flag_key, action, actor, detail) values (?, ?, ?, cast(? as jsonb))",
                key, action, actor, detailJson);
    }

    private static String[] toArray(List<String> names) {
        return names == null || names.isEmpty() ? null : names.toArray(String[]::new);
    }

    private static List<String> fromArray(String[] names) {
        return names == null ? List.of() : Arrays.asList(names);
    }

    private static Flag toFlag(Record r) {
        return new Flag(r.get(FEATURE_FLAGS.KEY), r.get(FEATURE_FLAGS.DESCRIPTION), r.get(FEATURE_FLAGS.ENABLED),
                r.get(FEATURE_FLAGS.ROLLOUT_PERCENT), fromArray(r.get(FEATURE_FLAGS.ALLOWED_PLANS)),
                fromArray(r.get(FEATURE_FLAGS.ALLOWED_ROLES)), r.get(FEATURE_FLAGS.CREATED_AT).toInstant(),
                r.get(FEATURE_FLAGS.UPDATED_AT).toInstant(), r.get(FEATURE_FLAGS.UPDATED_BY));
    }
}
