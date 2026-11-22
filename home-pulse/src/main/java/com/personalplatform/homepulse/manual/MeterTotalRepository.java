package com.personalplatform.homepulse.manual;

import static com.personalplatform.sql.jooq.home_pulse.home_pulse.Tables.METER_TOTALS;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

@Repository
public class MeterTotalRepository {

    /** A running meter total the owner entered, at a reading time. */
    public record Total(Instant ts, double kwh) {}

    private final DSLContext dsl;

    public MeterTotalRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    public Optional<Total> latest(UUID deviceId) {
        return dsl.select(METER_TOTALS.TS, METER_TOTALS.KWH).from(METER_TOTALS)
                .where(METER_TOTALS.DEVICE_ID.eq(deviceId))
                .orderBy(METER_TOTALS.TS.desc())
                .limit(1)
                .fetchOptional(r -> new Total(r.value1().toInstant(), r.value2()));
    }

    public void insert(UUID deviceId, Instant ts, double kwh) {
        dsl.insertInto(METER_TOTALS)
                .set(METER_TOTALS.DEVICE_ID, deviceId)
                .set(METER_TOTALS.TS, ts.atOffset(ZoneOffset.UTC))
                .set(METER_TOTALS.KWH, kwh)
                .execute();
    }
}
