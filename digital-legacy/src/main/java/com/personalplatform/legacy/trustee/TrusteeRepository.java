package com.personalplatform.legacy.trustee;

import static com.personalplatform.sql.jooq.legacy.legacy.Tables.TRUSTEES;

import com.personalplatform.legacy.config.Json;
import com.personalplatform.legacy.protocol.Contact;
import com.personalplatform.sql.UuidV7;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;

@Repository
public class TrusteeRepository {

    private final DSLContext dsl;
    private final Json json;

    public TrusteeRepository(DSLContext dsl, Json json) {
        this.dsl = dsl;
        this.json = json;
    }

    public UUID invite(UUID vaultId, String label, byte[] inviteHash, Instant expires, Instant now) {
        UUID id = UuidV7.next();
        dsl.insertInto(TRUSTEES)
                .set(TRUSTEES.ID, id)
                .set(TRUSTEES.VAULT_ID, vaultId)
                .set(TRUSTEES.LABEL, label)
                .set(TRUSTEES.INVITE_TOKEN_HASH, com.personalplatform.legacy.config.Tokens.hex(inviteHash))
                .set(TRUSTEES.INVITE_EXPIRES_AT, odt(expires))
                .set(TRUSTEES.CREATED_AT, odt(now))
                .execute();
        return id;
    }

    public List<TrusteeRow> listForVault(UUID vaultId) {
        return dsl.selectFrom(TRUSTEES).where(TRUSTEES.VAULT_ID.eq(vaultId)).orderBy(TRUSTEES.CREATED_AT, TRUSTEES.ID)
                .fetch(this::map);
    }

    /** Scoped by vault so one owner can never address another owner's trustee. */
    public Optional<TrusteeRow> findInVault(UUID vaultId, UUID trusteeId) {
        return dsl.selectFrom(TRUSTEES).where(TRUSTEES.ID.eq(trusteeId).and(TRUSTEES.VAULT_ID.eq(vaultId)))
                .fetchOptional(this::map);
    }

    public Optional<TrusteeRow> lockInVault(UUID vaultId, UUID trusteeId) {
        return dsl.selectFrom(TRUSTEES).where(TRUSTEES.ID.eq(trusteeId).and(TRUSTEES.VAULT_ID.eq(vaultId)))
                .forUpdate().fetchOptional(this::map);
    }

    public Optional<TrusteeRow> findByInviteHash(byte[] hash) {
        return dsl.selectFrom(TRUSTEES).where(TRUSTEES.INVITE_TOKEN_HASH.eq(com.personalplatform.legacy.config.Tokens.hex(hash))).forUpdate().fetchOptional(this::map);
    }

    public Optional<TrusteeRow> findByAccessHash(byte[] hash) {
        return dsl.selectFrom(TRUSTEES).where(TRUSTEES.ACCESS_TOKEN_HASH.eq(com.personalplatform.legacy.config.Tokens.hex(hash))).fetchOptional(this::map);
    }

    public void accept(UUID id, byte[] accessHash, String keyAlgorithm, byte[] publicKey, String fingerprint,
            List<Contact> contacts, Instant now) {
        dsl.update(TRUSTEES)
                .set(TRUSTEES.STATUS, TrusteeStatus.ACCEPTED.name())
                .set(TRUSTEES.ACCESS_TOKEN_HASH, com.personalplatform.legacy.config.Tokens.hex(accessHash))
                .set(TRUSTEES.KEY_ALGORITHM, keyAlgorithm)
                .set(TRUSTEES.PUBLIC_KEY, publicKey)
                .set(TRUSTEES.KEY_FINGERPRINT, fingerprint)
                .set(TRUSTEES.CONTACTS, json.toJsonb(contacts))
                .set(TRUSTEES.INVITE_USED_AT, odt(now))
                .set(TRUSTEES.ACCEPTED_AT, odt(now))
                .where(TRUSTEES.ID.eq(id))
                .execute();
    }

    public void storeShare(UUID id, String envelopeJson, byte[] sha256, int vaultVersion, Instant now) {
        dsl.update(TRUSTEES)
                .set(TRUSTEES.STATUS, TrusteeStatus.SHARE_UPLOADED.name())
                .set(TRUSTEES.SEALED_SHARE, envelopeJson)
                .set(TRUSTEES.SHARE_SHA256, sha256)
                .set(TRUSTEES.SHARE_VAULT_VERSION, vaultVersion)
                .set(TRUSTEES.SHARE_UPLOADED_AT, odt(now))
                .setNull(TRUSTEES.SHARE_CONFIRMED_AT)
                .where(TRUSTEES.ID.eq(id))
                .execute();
    }

    public void confirmShare(UUID id, Instant now) {
        dsl.update(TRUSTEES).set(TRUSTEES.STATUS, TrusteeStatus.CONFIRMED.name())
                .set(TRUSTEES.SHARE_CONFIRMED_AT, odt(now)).where(TRUSTEES.ID.eq(id)).execute();
    }

    /** Key rotation: every stored share is for the old key and is wiped; trustees keep their registered public key. */
    public void clearSharesForRotation(UUID vaultId) {
        dsl.update(TRUSTEES)
                .set(TRUSTEES.STATUS, TrusteeStatus.ACCEPTED.name())
                .setNull(TRUSTEES.SEALED_SHARE)
                .setNull(TRUSTEES.SHARE_SHA256)
                .setNull(TRUSTEES.SHARE_VAULT_VERSION)
                .setNull(TRUSTEES.SHARE_UPLOADED_AT)
                .setNull(TRUSTEES.SHARE_CONFIRMED_AT)
                .where(TRUSTEES.VAULT_ID.eq(vaultId)
                        .and(TRUSTEES.STATUS.in(TrusteeStatus.SHARE_UPLOADED.name(), TrusteeStatus.CONFIRMED.name())))
                .execute();
    }

    /** Revokes and drops everything the trustee could use: access token, share, public key stays for the record. */
    public void revoke(UUID id, Instant now) {
        dsl.update(TRUSTEES)
                .set(TRUSTEES.STATUS, TrusteeStatus.REVOKED.name())
                .set(TRUSTEES.REVOKED_AT, odt(now))
                .setNull(TRUSTEES.ACCESS_TOKEN_HASH)
                .setNull(TRUSTEES.SEALED_SHARE)
                .setNull(TRUSTEES.SHARE_SHA256)
                .setNull(TRUSTEES.SHARE_VAULT_VERSION)
                .where(TRUSTEES.ID.eq(id))
                .execute();
    }

    private TrusteeRow map(Record r) {
        var t = r.into(TRUSTEES);
        return new TrusteeRow(
                t.getId(),
                t.getVaultId(),
                t.getLabel(),
                TrusteeStatus.valueOf(t.getStatus()),
                inst(t.getInviteExpiresAt()),
                inst(t.getInviteUsedAt()),
                t.getKeyAlgorithm(),
                t.getPublicKey(),
                t.getKeyFingerprint(),
                t.getContacts() == null ? List.of() : json.read(t.getContacts(), new TypeReference<List<Contact>>() {}),
                t.getSealedShare(),
                t.getShareSha256(),
                t.getShareVaultVersion(),
                inst(t.getShareUploadedAt()),
                inst(t.getShareConfirmedAt()),
                inst(t.getAcceptedAt()),
                inst(t.getRevokedAt()),
                inst(t.getCreatedAt()));
    }

    private static OffsetDateTime odt(Instant i) {
        return i == null ? null : i.atOffset(ZoneOffset.UTC);
    }

    private static Instant inst(OffsetDateTime o) {
        return o == null ? null : o.toInstant();
    }
}
