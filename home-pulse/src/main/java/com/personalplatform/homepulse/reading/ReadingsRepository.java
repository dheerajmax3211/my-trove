package com.personalplatform.homepulse.reading;

import static com.personalplatform.homepulse.reading.TimescaleViews.AVG_AMPS;
import static com.personalplatform.homepulse.reading.TimescaleViews.AVG_VOLTS;
import static com.personalplatform.homepulse.reading.TimescaleViews.AVG_WATTS;
import static com.personalplatform.homepulse.reading.TimescaleViews.BUCKET;
import static com.personalplatform.homepulse.reading.TimescaleViews.DEVICE_ID;
import static com.personalplatform.homepulse.reading.TimescaleViews.MAX_WATTS;
import static com.personalplatform.homepulse.reading.TimescaleViews.MIN_WATTS;
import static com.personalplatform.homepulse.reading.TimescaleViews.READINGS_1H;
import static com.personalplatform.homepulse.reading.TimescaleViews.READINGS_1M;
import static com.personalplatform.homepulse.reading.TimescaleViews.SAMPLES;
import static com.personalplatform.sql.jooq.home_pulse.home_pulse.Tables.READINGS;

import com.personalplatform.homepulse.detect.MinuteSample;
import com.personalplatform.homepulse.device.Device;
import com.personalplatform.homepulse.ingest.ReadingInput;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.Field;
import org.jooq.InsertValuesStep5;
import org.jooq.Record;
import org.jooq.Table;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;

@Repository
public class ReadingsRepository {

    private static final Field<Double> WEIGHTED_AVG_WATTS =
            DSL.field("sum({0} * {1}) / nullif(sum({1}), 0)", Double.class, AVG_WATTS, SAMPLES);

    private final DSLContext dsl;

    public ReadingsRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    /** Returns how many rows were newly stored; rows whose (device, ts) already exist are silently skipped. */
    public int insertIgnoringDuplicates(UUID deviceId, List<ReadingInput> batch) {
        if (batch.isEmpty()) {
            return 0;
        }
        var insert = dsl.insertInto(READINGS, READINGS.DEVICE_ID, READINGS.TS, READINGS.WATTS, READINGS.VOLTS, READINGS.AMPS);
        InsertValuesStep5<?, UUID, OffsetDateTime, Double, Double, Double> values = insert;
        for (ReadingInput r : batch) {
            values = values.values(deviceId, r.ts().atOffset(ZoneOffset.UTC), r.watts(), r.volts(), r.amps());
        }
        return values.onConflictDoNothing().execute();
    }

    /** Simulator only: drops every reading of one device. */
    public int deleteForDevice(UUID deviceId) {
        return dsl.deleteFrom(READINGS).where(READINGS.DEVICE_ID.eq(deviceId)).execute();
    }

    public Optional<Instant> firstReading(UUID deviceId) {
        return Optional.ofNullable(dsl.select(DSL.min(READINGS.TS)).from(READINGS)
                        .where(READINGS.DEVICE_ID.eq(deviceId)).fetchOne(0, OffsetDateTime.class))
                .map(OffsetDateTime::toInstant);
    }

    public Optional<Instant> lastReading(UUID deviceId) {
        return Optional.ofNullable(dsl.select(DSL.max(READINGS.TS)).from(READINGS)
                        .where(READINGS.DEVICE_ID.eq(deviceId)).fetchOne(0, OffsetDateTime.class))
                .map(OffsetDateTime::toInstant);
    }

    /**
     * 1-minute samples in [from, to) for the evaluator and the health view, oldest first. Gaps of up to 4 minutes are
     * bridged ({@link SampleGapFill}), except after the last manual reading: manual readings cover exactly the minutes
     * the owner's totals cover, so nothing is held beyond them.
     */
    public List<MinuteSample> minuteSamples(Device device, Instant from, Instant to) {
        if (device.simulated()) {
            return minuteSamplesRaw(device.id(), from, to);
        }
        List<MinuteSample> samples = aggregatedSamples(device.id(), from, to);
        Instant limit = device.manual() && !samples.isEmpty() ? samples.get(samples.size() - 1).ts() : to;
        return SampleGapFill.fill(samples, limit);
    }

    /**
     * The same samples straight from the raw readings. A continuous aggregate only picks up rows inserted into
     * an already-materialised past range at its next refresh, so the simulator (which back-fills days of history
     * and evaluates at once) reads raw. Real devices keep using the aggregate.
     */
    public List<MinuteSample> minuteSamplesRaw(UUID deviceId, Instant from, Instant to) {
        Field<OffsetDateTime> bucket = DSL.field("time_bucket('1 minute', {0})", OffsetDateTime.class, READINGS.TS);
        Field<Double> avg = DSL.avg(READINGS.WATTS).cast(Double.class);
        List<MinuteSample> samples = dsl.select(bucket, avg).from(READINGS)
                .where(READINGS.DEVICE_ID.eq(deviceId), READINGS.TS.ge(from.atOffset(ZoneOffset.UTC)),
                        READINGS.TS.lt(to.atOffset(ZoneOffset.UTC)))
                .groupBy(bucket).orderBy(bucket)
                .fetch(r -> new MinuteSample(r.get(bucket).toInstant(), r.get(avg)));
        return SampleGapFill.fill(samples, to);
    }

    private List<MinuteSample> aggregatedSamples(UUID deviceId, Instant from, Instant to) {
        return dsl.select(BUCKET, AVG_WATTS).from(READINGS_1M)
                .where(DEVICE_ID.eq(deviceId), BUCKET.ge(from.atOffset(ZoneOffset.UTC)), BUCKET.lt(to.atOffset(ZoneOffset.UTC)))
                .orderBy(BUCKET)
                .fetch(r -> new MinuteSample(r.get(BUCKET).toInstant(), r.get(AVG_WATTS)));
    }

    /**
     * Series for [from, to) across the given devices at the given resolution, oldest first. Overlapping devices
     * (a replaced plug) are merged per bucket. Returns at most {@link Resolution#MAX_POINTS} + 1 rows.
     */
    public List<ReadingPoint> series(Collection<UUID> deviceIds, Instant from, Instant to, Resolution resolution) {
        if (deviceIds.isEmpty()) {
            return List.of();
        }
        OffsetDateTime f = from.atOffset(ZoneOffset.UTC);
        OffsetDateTime t = to.atOffset(ZoneOffset.UTC);
        int limit = Resolution.MAX_POINTS + 1;
        return switch (resolution) {
            case RAW -> dsl.select(READINGS.TS, DSL.avg(READINGS.WATTS).cast(Double.class), DSL.min(READINGS.WATTS),
                            DSL.max(READINGS.WATTS), DSL.avg(READINGS.VOLTS).cast(Double.class),
                            DSL.avg(READINGS.AMPS).cast(Double.class), DSL.count())
                    .from(READINGS)
                    .where(READINGS.DEVICE_ID.in(deviceIds), READINGS.TS.ge(f), READINGS.TS.lt(t))
                    .groupBy(READINGS.TS).orderBy(READINGS.TS).limit(limit)
                    .fetch(this::mapRow);
            case ONE_MINUTE -> aggregate(READINGS_1M, BUCKET, deviceIds, f, t, limit);
            case ONE_HOUR -> aggregate(READINGS_1H, BUCKET, deviceIds, f, t, limit);
            case ONE_DAY -> {
                Field<OffsetDateTime> day = DSL.field("time_bucket(interval '1 day', {0})", OffsetDateTime.class, BUCKET);
                yield dsl.select(day, WEIGHTED_AVG_WATTS, DSL.min(MIN_WATTS), DSL.max(MAX_WATTS),
                                DSL.avg(AVG_VOLTS).cast(Double.class), DSL.avg(AVG_AMPS).cast(Double.class), DSL.sum(SAMPLES).cast(Long.class))
                        .from(READINGS_1H)
                        .where(DEVICE_ID.in(deviceIds), BUCKET.ge(f), BUCKET.lt(t))
                        .groupBy(day).orderBy(day).limit(limit)
                        .fetch(this::mapRow);
            }
        };
    }

    private List<ReadingPoint> aggregate(Table<?> table, Field<OffsetDateTime> bucket, Collection<UUID> deviceIds,
                                         OffsetDateTime f, OffsetDateTime t, int limit) {
        return dsl.select(bucket, WEIGHTED_AVG_WATTS, DSL.min(MIN_WATTS), DSL.max(MAX_WATTS),
                        DSL.avg(AVG_VOLTS).cast(Double.class), DSL.avg(AVG_AMPS).cast(Double.class), DSL.sum(SAMPLES).cast(Long.class))
                .from(table)
                .where(DEVICE_ID.in(deviceIds), bucket.ge(f), bucket.lt(t))
                .groupBy(bucket).orderBy(bucket).limit(limit)
                .fetch(this::mapRow);
    }

    private ReadingPoint mapRow(Record r) {
        return new ReadingPoint(r.get(0, OffsetDateTime.class).toInstant(), r.get(1, Double.class),
                r.get(2, Double.class), r.get(3, Double.class), r.get(4, Double.class), r.get(5, Double.class),
                r.get(6, Long.class) == null ? 0 : r.get(6, Long.class));
    }
}
