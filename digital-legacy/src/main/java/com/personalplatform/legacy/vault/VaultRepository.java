package com.personalplatform.legacy.vault;

import static com.personalplatform.sql.jooq.legacy.legacy.Tables.VAULTS;

import com.personalplatform.legacy.config.Json;
import com.personalplatform.legacy.protocol.SwitchPolicy;
import com.personalplatform.legacy.protocol.SwitchState;
import com.personalplatform.sql.UuidV7;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.Field;
import org.jooq.Record;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;

/**
 * jOOQ access to {@code legacy.vaults}. Every method that serves an owner is keyed by {@code owner_uid}; lookups by
 * vault id exist only for the scheduler and for trustees whose vault id comes from their authenticated principal.
 */
@Repository
public class VaultRepository {

    private static final Field<Integer> CIPHERTEXT_BYTES =
            DSL.field("octet_length({0})", Integer.class, VAULTS.CIPHERTEXT).as("ciphertext_bytes");

    private static final List<Field<?>> ROW_FIELDS = List.of(
            VAULTS.ID, VAULTS.OWNER_UID, VAULTS.STATE, VAULTS.ARMED, VAULTS.EPOCH, VAULTS.POLICY,
            VAULTS.LAST_CHECKIN_AT, VAULTS.NEXT_DUE_AT, VAULTS.STATE_ENTERED_AT, VAULTS.STEPS_EXECUTED,
            VAULTS.QUORUM_REACHED_AT, VAULTS.PAUSED_UNTIL, VAULTS.PAUSE_WINDOW_START, VAULTS.PAUSE_USED_SECONDS,
            VAULTS.NEXT_ACTION_AT, VAULTS.VAULT_VERSION, VAULTS.CONTENT_REVISION, VAULTS.CIPHERTEXT_SHA256,
            CIPHERTEXT_BYTES, VAULTS.METADATA, VAULTS.RELEASED_AT, VAULTS.CREATED_AT, VAULTS.UPDATED_AT);

    private final DSLContext dsl;
    private final Json json;

    public VaultRepository(DSLContext dsl, Json json) {
        this.dsl = dsl;
        this.json = json;
    }

    public Optional<VaultRow> findByOwner(String ownerUid) {
        return dsl.select(ROW_FIELDS).from(VAULTS).where(VAULTS.OWNER_UID.eq(ownerUid)).fetchOptional(this::map);
    }

    /** Row lock: serialises owner actions with the scheduler. */
    public Optional<VaultRow> lockByOwner(String ownerUid) {
        return dsl.select(ROW_FIELDS).from(VAULTS).where(VAULTS.OWNER_UID.eq(ownerUid)).forUpdate()
                .fetchOptional(this::map);
    }

    public Optional<VaultRow> lockById(UUID id) {
        return dsl.select(ROW_FIELDS).from(VAULTS).where(VAULTS.ID.eq(id)).forUpdate().fetchOptional(this::map);
    }

    public Optional<VaultRow> findById(UUID id) {
        return dsl.select(ROW_FIELDS).from(VAULTS).where(VAULTS.ID.eq(id)).fetchOptional(this::map);
    }

    /**
     * Claims one due, armed, unreleased vault with {@code FOR UPDATE SKIP LOCKED}: a row another scheduler instance
     * (or an owner request) currently holds is skipped, never waited for, so instances cannot double-process.
     */
    public Optional<VaultRow> claimDue(Instant now, java.util.Collection<UUID> exclude) {
        var cond = VAULTS.ARMED.isTrue()
                .and(VAULTS.STATE.ne(SwitchState.RELEASED.name()))
                .and(VAULTS.NEXT_ACTION_AT.le(odt(now)));
        if (!exclude.isEmpty()) {
            cond = cond.and(VAULTS.ID.notIn(exclude));
        }
        return dsl.select(ROW_FIELDS).from(VAULTS).where(cond)
                .orderBy(VAULTS.NEXT_ACTION_AT).limit(1).forUpdate().skipLocked().fetchOptional(this::map);
    }

    public VaultRow insert(String ownerUid, byte[] ciphertext, byte[] sha256, String metadataJson, Instant now) {
        UUID id = UuidV7.next();
        dsl.insertInto(VAULTS)
                .set(VAULTS.ID, id)
                .set(VAULTS.OWNER_UID, ownerUid)
                .set(VAULTS.CIPHERTEXT, ciphertext)
                .set(VAULTS.CIPHERTEXT_SHA256, sha256)
                .set(VAULTS.METADATA, org.jooq.JSONB.jsonb(metadataJson))
                .set(VAULTS.CREATED_AT, odt(now))
                .set(VAULTS.UPDATED_AT, odt(now))
                .execute();
        return findById(id).orElseThrow();
    }

    public void updateContent(
            UUID id, byte[] ciphertext, byte[] sha256, String metadataJson, boolean keyRotated, Instant now) {
        var step = dsl.update(VAULTS)
                .set(VAULTS.CIPHERTEXT, ciphertext)
                .set(VAULTS.CIPHERTEXT_SHA256, sha256)
                .set(VAULTS.METADATA, org.jooq.JSONB.jsonb(metadataJson))
                .set(VAULTS.CONTENT_REVISION, VAULTS.CONTENT_REVISION.plus(1))
                .set(VAULTS.UPDATED_AT, odt(now));
        if (keyRotated) {
            step = step.set(VAULTS.VAULT_VERSION, VAULTS.VAULT_VERSION.plus(1)).set(VAULTS.ARMED, false)
                    .setNull(VAULTS.NEXT_ACTION_AT);
        }
        step.where(VAULTS.ID.eq(id)).execute();
    }

    public void savePolicy(UUID id, SwitchPolicy policy, Instant now) {
        dsl.update(VAULTS).set(VAULTS.POLICY, json.toJsonb(policy)).set(VAULTS.UPDATED_AT, odt(now))
                .where(VAULTS.ID.eq(id)).execute();
    }

    /** Persists the whole protocol state of a (locked) row, including the durable timer. */
    public void saveSwitch(VaultRow r, Instant nextActionAt, Instant now) {
        dsl.update(VAULTS)
                .set(VAULTS.STATE, r.state().name())
                .set(VAULTS.ARMED, r.armed())
                .set(VAULTS.EPOCH, r.epoch())
                .set(VAULTS.LAST_CHECKIN_AT, odt(r.lastCheckinAt()))
                .set(VAULTS.NEXT_DUE_AT, odt(r.nextDueAt()))
                .set(VAULTS.STATE_ENTERED_AT, odt(r.stateEnteredAt()))
                .set(VAULTS.STEPS_EXECUTED, r.stepsExecuted())
                .set(VAULTS.QUORUM_REACHED_AT, odt(r.quorumReachedAt()))
                .set(VAULTS.PAUSED_UNTIL, odt(r.pausedUntil()))
                .set(VAULTS.PAUSE_WINDOW_START, odt(r.pauseWindowStart()))
                .set(VAULTS.PAUSE_USED_SECONDS, r.pauseUsedSeconds())
                .set(VAULTS.NEXT_ACTION_AT, odt(nextActionAt))
                .set(VAULTS.RELEASED_AT, odt(r.releasedAt()))
                .set(VAULTS.UPDATED_AT, odt(now))
                .where(VAULTS.ID.eq(r.id()))
                .execute();
    }

    /** Used after a failed tick so one poison row cannot monopolise the scheduler. */
    public void postpone(UUID id, Instant until) {
        dsl.update(VAULTS).set(VAULTS.NEXT_ACTION_AT, odt(until)).where(VAULTS.ID.eq(id)).execute();
    }

    public Optional<CiphertextBlob> fetchCiphertext(UUID id) {
        return dsl.select(VAULTS.CIPHERTEXT, VAULTS.METADATA, VAULTS.VAULT_VERSION, VAULTS.CIPHERTEXT_SHA256)
                .from(VAULTS).where(VAULTS.ID.eq(id))
                .fetchOptional(r -> new CiphertextBlob(r.get(VAULTS.CIPHERTEXT), r.get(VAULTS.METADATA).data(),
                        r.get(VAULTS.VAULT_VERSION), r.get(VAULTS.CIPHERTEXT_SHA256)));
    }

    public record CiphertextBlob(byte[] ciphertext, String metadataJson, int vaultVersion, byte[] sha256) {}

    private VaultRow map(Record r) {
        return new VaultRow(
                r.get(VAULTS.ID),
                r.get(VAULTS.OWNER_UID),
                SwitchState.valueOf(r.get(VAULTS.STATE)),
                r.get(VAULTS.ARMED),
                r.get(VAULTS.EPOCH),
                json.read(r.get(VAULTS.POLICY), SwitchPolicy.class),
                inst(r.get(VAULTS.LAST_CHECKIN_AT)),
                inst(r.get(VAULTS.NEXT_DUE_AT)),
                inst(r.get(VAULTS.STATE_ENTERED_AT)),
                r.get(VAULTS.STEPS_EXECUTED),
                inst(r.get(VAULTS.QUORUM_REACHED_AT)),
                inst(r.get(VAULTS.PAUSED_UNTIL)),
                inst(r.get(VAULTS.PAUSE_WINDOW_START)),
                r.get(VAULTS.PAUSE_USED_SECONDS),
                inst(r.get(VAULTS.NEXT_ACTION_AT)),
                r.get(VAULTS.VAULT_VERSION),
                r.get(VAULTS.CONTENT_REVISION),
                r.get(VAULTS.CIPHERTEXT_SHA256),
                r.get(CIPHERTEXT_BYTES),
                r.get(VAULTS.METADATA).data(),
                inst(r.get(VAULTS.RELEASED_AT)),
                inst(r.get(VAULTS.CREATED_AT)),
                inst(r.get(VAULTS.UPDATED_AT)));
    }

    static OffsetDateTime odt(Instant i) {
        return i == null ? null : i.atOffset(ZoneOffset.UTC);
    }

    static Instant inst(OffsetDateTime o) {
        return o == null ? null : o.toInstant();
    }
}
