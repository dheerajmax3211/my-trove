package com.personalplatform.sql;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.sql.jooq.home_pulse.home_pulse.HomePulse;
import java.sql.Connection;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.jooq.Table;
import org.jooq.SQLDialect;
import org.jooq.impl.DSL;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * home-pulse needs TimescaleDB, so unlike {@link SchemaMigrationTest} (plain postgres:16, auth schema only) this
 * runs BOTH home-pulse Flyway locations on the timescale image and proves that the hypertable, the continuous
 * aggregates and the compression / retention / refresh policies really exist and behave.
 * All timestamps are in 2031 so the container's wall-clock based background jobs never touch the test data.
 */
@Testcontainers
class HomePulseSchemaTest {

    @Container
    static final PostgreSQLContainer TIMESCALE = new PostgreSQLContainer(
            DockerImageName.parse("timescale/timescaledb:2.32.0-pg16").asCompatibleSubstituteFor("postgres"));

    static DataSource dataSource;

    @BeforeAll
    static void migrate() {
        PGSimpleDataSource ds = new PGSimpleDataSource();
        ds.setUrl(TIMESCALE.getJdbcUrl());
        ds.setUser(TIMESCALE.getUsername());
        ds.setPassword(TIMESCALE.getPassword());
        dataSource = ds;
        Flyway.configure()
                .dataSource(ds)
                .schemas("home_pulse")
                .defaultSchema("home_pulse")
                .locations("classpath:db/migration/home_pulse", "classpath:db/migration/home_pulse_ext")
                .load()
                .migrate();
    }

    private static <T> T inDsl(java.util.function.Function<DSLContext, T> f) throws Exception {
        try (Connection c = dataSource.getConnection()) {   // autocommit: refresh_continuous_aggregate refuses transactions
            return f.apply(DSL.using(c, SQLDialect.POSTGRES));
        }
    }

    private static long count(DSLContext dsl, String sql, Object... args) {
        return ((Number) dsl.fetchValue(sql, args)).longValue();
    }

    @Test
    void bothMigrationLocationsWereAppliedInOrderThroughOneHistoryTable() throws Exception {
        List<String> versions = inDsl(dsl -> dsl.fetch(
                "select version from home_pulse.flyway_schema_history where success and version is not null order by installed_rank")
                .getValues(0, String.class));
        assertThat(versions).containsExactly("1", "2", "100", "101", "102");
    }

    @Test
    void devicesAndAlertsCarryTheSimulatedFlagDefaultingToFalse() throws Exception {
        inDsl(dsl -> {
            assertThat(count(dsl, "select count(*) from information_schema.columns where table_schema = 'home_pulse' "
                    + "and column_name = 'simulated' and table_name in ('devices', 'alerts') "
                    + "and is_nullable = 'NO' and column_default = 'false'")).isEqualTo(2);
            return null;
        });
    }

    @Test
    void readingsIsAHypertableWithDailyChunksAndCompressionEnabled() throws Exception {
        inDsl(dsl -> {
            Record h = dsl.fetchOne("select compression_enabled, num_dimensions from timescaledb_information.hypertables "
                    + "where hypertable_schema = 'home_pulse' and hypertable_name = 'readings'");
            assertThat(h).as("readings is a hypertable").isNotNull();
            assertThat(h.get("compression_enabled", Boolean.class)).isTrue();
            Record d = dsl.fetchOne("select column_name, time_interval::text from timescaledb_information.dimensions "
                    + "where hypertable_schema = 'home_pulse' and hypertable_name = 'readings'");
            assertThat(d.get(0)).isEqualTo("ts");
            assertThat(d.get(1)).isEqualTo("1 day");
            Record cs = dsl.fetchOne("select segmentby, orderby from timescaledb_information.hypertable_columnstore_settings "
                    + "where hypertable = 'home_pulse.readings'::regclass");
            assertThat(cs.get(0, String.class)).isEqualTo("device_id");
            return null;
        });
    }

    @Test
    void oneMinuteAndOneHourContinuousAggregatesExistAndAreRealTime() throws Exception {
        inDsl(dsl -> {
            List<Record> caggs = dsl.fetch("select view_name, materialized_only from "
                    + "timescaledb_information.continuous_aggregates where view_schema = 'home_pulse' order by view_name");
            assertThat(caggs).extracting(r -> r.get("view_name", String.class)).containsExactly("readings_1h", "readings_1m");
            assertThat(caggs).allSatisfy(r -> assertThat(r.get("materialized_only", Boolean.class)).isFalse());
            return null;
        });
    }

    @Test
    void compressionRetentionAndRefreshPoliciesAreScheduled() throws Exception {
        inDsl(dsl -> {
            Record compression = dsl.fetchOne("select config->>'compress_after' from timescaledb_information.jobs "
                    + "where proc_name = 'policy_compression' and hypertable_schema = 'home_pulse' and hypertable_name = 'readings'");
            assertThat(compression).as("compression policy on readings").isNotNull();
            assertThat(compression.get(0)).isEqualTo("7 days");

            var retention = dsl.fetch("select hypertable_name, config->>'drop_after' from timescaledb_information.jobs "
                    + "where proc_name = 'policy_retention' and hypertable_schema = 'home_pulse' order by hypertable_name");
            assertThat(retention.getValues(0, String.class)).containsExactly("readings", "readings_1h", "readings_1m");
            assertThat(retention.stream().collect(java.util.stream.Collectors.toMap(r -> r.get(0, String.class), r -> r.get(1, String.class))))
                    .containsEntry("readings", "90 days").containsEntry("readings_1m", "365 days").containsEntry("readings_1h", "1825 days");

            var refresh = dsl.fetch("select hypertable_name, schedule_interval::text from timescaledb_information.jobs "
                    + "where proc_name = 'policy_refresh_continuous_aggregate' and hypertable_schema = 'home_pulse' order by 1");
            assertThat(refresh).hasSize(2);
            return null;
        });
    }

    @Test
    void everyGeneratedTableMatchesThePostgresSchema() throws Exception {
        inDsl(dsl -> {
            assertThat(HomePulse.HOME_PULSE.getTables()).hasSize(5);
            for (Table<?> t : HomePulse.HOME_PULSE.getTables()) {
                dsl.selectFrom(t).limit(0).fetch();   // fails if any generated column is missing in the database
            }
            return null;
        });
    }

    @Test
    void rollupQueriesReturnTheExpectedBucketsBeforeAndAfterMaterialization() throws Exception {
        UUID device = UUID.randomUUID();
        inDsl(dsl -> {
            dsl.execute("insert into home_pulse.readings (device_id, ts, watts) values "
                    + "(?, '2031-01-15 12:00:10+00', 100), (?, '2031-01-15 12:00:40+00', 200), "
                    + "(?, '2031-01-15 12:01:05+00', 300), (?, '2031-01-15 12:59:59+00', 50), "
                    + "(?, '2031-01-15 13:00:30+00', 70)", device, device, device, device, device);

            // 1) real-time: nothing is materialized yet, the view aggregates the raw rows on the fly
            var minutes = oneMinute(dsl, device);
            assertThat(minutes).hasSize(4);
            assertThat(minutes.get(0)).containsExactly("2031-01-15 12:00:00", 150.0, 100.0, 200.0, 2L);
            assertThat(minutes.get(1)).containsExactly("2031-01-15 12:01:00", 300.0, 300.0, 300.0, 1L);
            assertThat(minutes.get(2)).containsExactly("2031-01-15 12:59:00", 50.0, 50.0, 50.0, 1L);
            assertThat(minutes.get(3)).containsExactly("2031-01-15 13:00:00", 70.0, 70.0, 70.0, 1L);
            var hours = oneHour(dsl, device);
            assertThat(hours).hasSize(2);
            assertThat(hours.get(0)).containsExactly("2031-01-15 12:00:00", 162.5, 50.0, 300.0, 4L);
            assertThat(hours.get(1)).containsExactly("2031-01-15 13:00:00", 70.0, 70.0, 70.0, 1L);

            // 2) materialize: same answer, now served from the materialization hypertable
            refresh(dsl, "readings_1m");
            refresh(dsl, "readings_1h");
            assertThat(count(dsl, "select count(*) from " + materializationTable(dsl, "readings_1m"))).isEqualTo(4);
            assertThat(oneMinute(dsl, device)).isEqualTo(minutes);
            assertThat(oneHour(dsl, device)).isEqualTo(hours);

            // 3) data newer than the materialization watermark is visible immediately (real-time aggregation)...
            dsl.execute("insert into home_pulse.readings (device_id, ts, watts) values (?, '2031-01-16 08:00:10+00', 999)", device);
            assertThat(oneMinute(dsl, device)).hasSize(5);
            assertThat(oneMinute(dsl, device).get(4)).containsExactly("2031-01-16 08:00:00", 999.0, 999.0, 999.0, 1L);

            // 4) ...while a late row behind the watermark only shows up once the policy (or a manual refresh) runs
            dsl.execute("insert into home_pulse.readings (device_id, ts, watts) values (?, '2031-01-15 12:00:55+00', 400)", device);
            assertThat(oneMinute(dsl, device).get(0)).containsExactly("2031-01-15 12:00:00", 150.0, 100.0, 200.0, 2L);
            refresh(dsl, "readings_1m");
            assertThat(oneMinute(dsl, device).get(0)).containsExactly("2031-01-15 12:00:00", 233.33333333333334, 100.0, 400.0, 3L);
            return null;
        });
    }

    @Test
    void primaryKeyMakesIngestionIdempotentEvenOnCompressedChunks() throws Exception {
        UUID device = UUID.randomUUID();
        inDsl(dsl -> {
            String insert = "insert into home_pulse.readings (device_id, ts, watts) values (?, '2031-03-01 10:00:00+00', 10), "
                    + "(?, '2031-03-01 10:00:01+00', 11) on conflict do nothing";
            assertThat(dsl.execute(insert, device, device)).isEqualTo(2);
            assertThat(dsl.execute(insert, device, device)).as("duplicates are ignored").isZero();
            assertThat(count(dsl, "select count(*) from home_pulse.readings where device_id = ?", device)).isEqualTo(2);

            // the same holds after the chunk has been compressed (what the compression policy does after 7 days)
            dsl.execute("select compress_chunk(c, if_not_compressed => true) from show_chunks('home_pulse.readings') c");
            assertThat(count(dsl, "select count(*) from timescaledb_information.chunks where hypertable_schema = 'home_pulse' "
                    + "and hypertable_name = 'readings' and is_compressed")).isGreaterThanOrEqualTo(1);
            assertThat(dsl.execute(insert, device, device)).isZero();
            assertThat(count(dsl, "select count(*) from home_pulse.readings where device_id = ?", device)).isEqualTo(2);
            return null;
        });
    }

    // ----------------------------------------------------------------- helpers

    private static List<List<Object>> oneMinute(DSLContext dsl, UUID device) {
        return rollup(dsl, "readings_1m", device);
    }

    private static List<List<Object>> oneHour(DSLContext dsl, UUID device) {
        return rollup(dsl, "readings_1h", device);
    }

    private static List<List<Object>> rollup(DSLContext dsl, String view, UUID device) {
        return dsl.fetch("select to_char(bucket at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS'), avg_watts, min_watts, max_watts, samples "
                        + "from home_pulse." + view + " where device_id = ? order by bucket", device)
                .map(r -> List.<Object>of(r.get(0, String.class), r.get(1, Double.class), r.get(2, Double.class),
                        r.get(3, Double.class), r.get(4, Long.class)));
    }

    private static void refresh(DSLContext dsl, String view) {
        dsl.execute("call refresh_continuous_aggregate('home_pulse." + view + "', '2031-01-01 00:00:00+00', '2031-01-16 00:00:00+00')");
    }

    private static String materializationTable(DSLContext dsl, String view) {
        return dsl.fetchValue("select materialization_hypertable_schema || '.' || materialization_hypertable_name "
                + "from timescaledb_information.continuous_aggregates where view_schema = 'home_pulse' and view_name = ?", view)
                .toString();
    }
}
