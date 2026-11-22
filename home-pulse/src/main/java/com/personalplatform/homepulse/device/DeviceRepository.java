package com.personalplatform.homepulse.device;

import static com.personalplatform.sql.jooq.home_pulse.home_pulse.Tables.DEVICES;

import com.personalplatform.sql.UuidV7;
import com.personalplatform.sql.jooq.home_pulse.home_pulse.tables.records.DevicesRecord;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

@Repository
public class DeviceRepository {

    private final DSLContext dsl;

    public DeviceRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    public Device insert(String ownerUid, UUID applianceId, String label, String tokenHash, String tokenPrefix, Instant now) {
        return insert(ownerUid, applianceId, label, tokenHash, tokenPrefix, now, false, false);
    }

    public Device insert(String ownerUid, UUID applianceId, String label, String tokenHash, String tokenPrefix, Instant now,
                         boolean simulated) {
        return insert(ownerUid, applianceId, label, tokenHash, tokenPrefix, now, simulated, false);
    }

    public Device insert(String ownerUid, UUID applianceId, String label, String tokenHash, String tokenPrefix, Instant now,
                         boolean simulated, boolean manual) {
        UUID id = UuidV7.next();
        dsl.insertInto(DEVICES)
                .set(DEVICES.ID, id)
                .set(DEVICES.OWNER_UID, ownerUid)
                .set(DEVICES.APPLIANCE_ID, applianceId)
                .set(DEVICES.LABEL, label)
                .set(DEVICES.TOKEN_HASH, tokenHash)
                .set(DEVICES.TOKEN_PREFIX, tokenPrefix)
                .set(DEVICES.CREATED_AT, now.atOffset(ZoneOffset.UTC))
                .set(DEVICES.SIMULATED, simulated)
                .set(DEVICES.MANUAL, manual)
                .execute();
        return find(ownerUid, id).orElseThrow();
    }

    public Optional<Device> find(String ownerUid, UUID id) {
        return dsl.selectFrom(DEVICES).where(DEVICES.ID.eq(id), DEVICES.OWNER_UID.eq(ownerUid)).fetchOptional(this::map);
    }

    public List<Device> listForAppliance(String ownerUid, UUID applianceId) {
        return dsl.selectFrom(DEVICES)
                .where(DEVICES.APPLIANCE_ID.eq(applianceId), DEVICES.OWNER_UID.eq(ownerUid))
                .orderBy(DEVICES.CREATED_AT.desc(), DEVICES.ID)
                .fetch(this::map);
    }

    public boolean hasActive(UUID applianceId) {
        return dsl.fetchExists(DEVICES, DEVICES.APPLIANCE_ID.eq(applianceId), DEVICES.REVOKED_AT.isNull());
    }

    /** The live device of an appliance (at most one by constraint). Internal use by the scheduler and health view. */
    public Optional<Device> findActiveForAppliance(UUID applianceId) {
        return dsl.selectFrom(DEVICES)
                .where(DEVICES.APPLIANCE_ID.eq(applianceId), DEVICES.REVOKED_AT.isNull())
                .fetchOptional(this::map);
    }

    /** Ingestion auth: live device whose token hash matches. */
    public Optional<Device> findActiveByTokenHash(String tokenHash) {
        return dsl.selectFrom(DEVICES)
                .where(DEVICES.TOKEN_HASH.eq(tokenHash), DEVICES.REVOKED_AT.isNull())
                .fetchOptional(this::map);
    }

    /** MQTT path: the device id comes from the topic, so only a live device is accepted. */
    public Optional<Device> findActiveById(UUID id) {
        return dsl.selectFrom(DEVICES).where(DEVICES.ID.eq(id), DEVICES.REVOKED_AT.isNull()).fetchOptional(this::map);
    }

    public boolean revoke(String ownerUid, UUID id, Instant now) {
        return dsl.update(DEVICES)
                .set(DEVICES.REVOKED_AT, now.atOffset(ZoneOffset.UTC))
                .where(DEVICES.ID.eq(id), DEVICES.OWNER_UID.eq(ownerUid), DEVICES.REVOKED_AT.isNull())
                .execute() == 1;
    }

    public void touch(UUID id, Instant seenAt) {
        dsl.update(DEVICES)
                .set(DEVICES.LAST_SEEN_AT, seenAt.atOffset(ZoneOffset.UTC))
                .where(DEVICES.ID.eq(id))
                .execute();
    }

    /** Removes a device row (simulator only: real devices are only ever soft-revoked). Owner-scoped. */
    public boolean deleteSimulated(String ownerUid, UUID id) {
        return dsl.deleteFrom(DEVICES)
                .where(DEVICES.ID.eq(id), DEVICES.OWNER_UID.eq(ownerUid), DEVICES.SIMULATED.isTrue())
                .execute() == 1;
    }

    private Device map(DevicesRecord r) {
        return new Device(r.getId(), r.getOwnerUid(), r.getApplianceId(), r.getLabel(), r.getTokenPrefix(),
                r.getCreatedAt().toInstant(),
                r.getLastSeenAt() == null ? null : r.getLastSeenAt().toInstant(),
                r.getRevokedAt() == null ? null : r.getRevokedAt().toInstant(),
                r.getSimulated(), r.getManual());
    }
}
