package com.personalplatform.homepulse.appliance;

import static com.personalplatform.sql.jooq.home_pulse.home_pulse.Tables.APPLIANCES;

import com.personalplatform.homepulse.detect.ApplianceType;
import com.personalplatform.sql.UuidV7;
import com.personalplatform.sql.jooq.home_pulse.home_pulse.tables.records.AppliancesRecord;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

/** Every method takes the owner uid: there is no way to read or write another owner's appliance. */
@Repository
public class ApplianceRepository {

    private final DSLContext dsl;

    public ApplianceRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    public Appliance insert(String ownerUid, ApplianceRequest r, Instant now) {
        UUID id = UuidV7.next();
        dsl.insertInto(APPLIANCES)
                .set(APPLIANCES.ID, id)
                .set(APPLIANCES.OWNER_UID, ownerUid)
                .set(APPLIANCES.NAME, r.name())
                .set(APPLIANCES.TYPE, r.type().name())
                .set(APPLIANCES.LOCATION, r.location())
                .set(APPLIANCES.PURCHASE_DATE, r.purchaseDate())
                .set(APPLIANCES.WARRANTY_END_DATE, r.warrantyEndDate())
                .set(APPLIANCES.LAST_SERVICE_DATE, r.lastServiceDate())
                .set(APPLIANCES.NEXT_SERVICE_DATE, r.nextServiceDate())
                .set(APPLIANCES.NOTES, r.notes())
                .set(APPLIANCES.CREATED_AT, now.atOffset(ZoneOffset.UTC))
                .set(APPLIANCES.UPDATED_AT, now.atOffset(ZoneOffset.UTC))
                .execute();
        return find(ownerUid, id).orElseThrow();
    }

    public Optional<Appliance> find(String ownerUid, UUID id) {
        return dsl.selectFrom(APPLIANCES)
                .where(APPLIANCES.ID.eq(id), APPLIANCES.OWNER_UID.eq(ownerUid))
                .fetchOptional(this::map);
    }

    /** Scheduler use only (not owner-scoped): the evaluator works across all owners. */
    public Optional<Appliance> findInternal(UUID id) {
        return dsl.selectFrom(APPLIANCES).where(APPLIANCES.ID.eq(id)).fetchOptional(this::map);
    }

    public List<Appliance> list(String ownerUid) {
        return dsl.selectFrom(APPLIANCES)
                .where(APPLIANCES.OWNER_UID.eq(ownerUid))
                .orderBy(APPLIANCES.NAME, APPLIANCES.ID)
                .fetch(this::map);
    }

    public boolean update(String ownerUid, UUID id, ApplianceRequest r, Instant now) {
        return dsl.update(APPLIANCES)
                .set(APPLIANCES.NAME, r.name())
                .set(APPLIANCES.TYPE, r.type().name())
                .set(APPLIANCES.LOCATION, r.location())
                .set(APPLIANCES.PURCHASE_DATE, r.purchaseDate())
                .set(APPLIANCES.WARRANTY_END_DATE, r.warrantyEndDate())
                .set(APPLIANCES.LAST_SERVICE_DATE, r.lastServiceDate())
                .set(APPLIANCES.NEXT_SERVICE_DATE, r.nextServiceDate())
                .set(APPLIANCES.NOTES, r.notes())
                .set(APPLIANCES.UPDATED_AT, now.atOffset(ZoneOffset.UTC))
                .where(APPLIANCES.ID.eq(id), APPLIANCES.OWNER_UID.eq(ownerUid))
                .execute() == 1;
    }

    public boolean delete(String ownerUid, UUID id) {
        return dsl.deleteFrom(APPLIANCES)
                .where(APPLIANCES.ID.eq(id), APPLIANCES.OWNER_UID.eq(ownerUid))
                .execute() == 1;
    }

    /**
     * Scheduler use only (spans owners): every appliance that currently has a live, real device. A simulated device
     * is a snapshot that stops "reporting" the moment it is generated, so the scheduler would only raise NO_DATA
     * for it; the simulator evaluates it once, on demand.
     */
    public List<Appliance> listWithActiveDevice() {
        var d = com.personalplatform.sql.jooq.home_pulse.home_pulse.Tables.DEVICES;
        return dsl.selectFrom(APPLIANCES)
                .whereExists(dsl.selectOne().from(d)
                        .where(d.APPLIANCE_ID.eq(APPLIANCES.ID), d.REVOKED_AT.isNull(), d.SIMULATED.isFalse()))
                .orderBy(APPLIANCES.ID)
                .fetch(this::map);
    }

    private Appliance map(AppliancesRecord r) {
        return new Appliance(r.getId(), r.getOwnerUid(), r.getName(), ApplianceType.valueOf(r.getType()),
                r.getLocation(), r.getPurchaseDate(), r.getWarrantyEndDate(), r.getLastServiceDate(),
                r.getNextServiceDate(), r.getNotes(), r.getCreatedAt().toInstant(), r.getUpdatedAt().toInstant());
    }
}
