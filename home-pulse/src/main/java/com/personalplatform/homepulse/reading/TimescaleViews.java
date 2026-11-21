package com.personalplatform.homepulse.reading;

import java.time.OffsetDateTime;
import java.util.UUID;
import org.jooq.Field;
import org.jooq.Table;
import org.jooq.impl.DSL;
import org.jooq.impl.SQLDataType;

/**
 * Hand-written jOOQ handles for the continuous aggregates. The generator parses only the plain-table migrations
 * (db/migration/home_pulse); {@code readings_1m} / {@code readings_1h} are created by the TimescaleDB-specific
 * migrations (db/migration/home_pulse_ext) which it never sees. The raw {@code readings} table IS generated
 * (created as a plain table in V1, converted to a hypertable in V100), so it is not repeated here.
 */
public final class TimescaleViews {

    public static final Table<?> READINGS_1M = DSL.table(DSL.name("home_pulse", "readings_1m"));
    public static final Table<?> READINGS_1H = DSL.table(DSL.name("home_pulse", "readings_1h"));

    public static final Field<UUID> DEVICE_ID = DSL.field(DSL.name("device_id"), SQLDataType.UUID);
    public static final Field<OffsetDateTime> BUCKET = DSL.field(DSL.name("bucket"), SQLDataType.TIMESTAMPWITHTIMEZONE);
    public static final Field<Double> AVG_WATTS = DSL.field(DSL.name("avg_watts"), SQLDataType.DOUBLE);
    public static final Field<Double> MAX_WATTS = DSL.field(DSL.name("max_watts"), SQLDataType.DOUBLE);
    public static final Field<Double> MIN_WATTS = DSL.field(DSL.name("min_watts"), SQLDataType.DOUBLE);
    public static final Field<Double> AVG_VOLTS = DSL.field(DSL.name("avg_volts"), SQLDataType.DOUBLE);
    public static final Field<Double> AVG_AMPS = DSL.field(DSL.name("avg_amps"), SQLDataType.DOUBLE);
    public static final Field<Long> SAMPLES = DSL.field(DSL.name("samples"), SQLDataType.BIGINT);

    private TimescaleViews() {}
}
