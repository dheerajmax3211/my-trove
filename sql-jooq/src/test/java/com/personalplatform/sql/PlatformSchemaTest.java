package com.personalplatform.sql;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.sql.jooq.platform.platform.Platform;
import java.sql.Connection;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.jooq.SQLDialect;
import org.jooq.Table;
import org.jooq.impl.DSL;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * platform-service needs TimescaleDB: this runs BOTH platform Flyway locations on the timescale image and proves that
 * the usage hypertable, the three continuous aggregates (1 minute, 1 hour, 1 day) and the refresh / retention
 * policies exist and roll the latency buckets up correctly. All timestamps are in 2031 so the container's wall-clock
 * based background jobs never touch the test data.
 */
@Testcontainers
class PlatformSchemaTest {

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
                .schemas("platform")
                .defaultSchema("platform")
                .locations("classpath:db/migration/platform", "classpath:db/migration/platform_ext")
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
                "select version from platform.flyway_schema_history where success and version is not null order by installed_rank")
                .getValues(0, String.class));
        assertThat(versions).containsExactly("1", "2", "3", "4", "5", "6", "100", "101", "102", "103");
    }

    @Test
    void usageEventsIsAHypertablePartitionedByTs() throws Exception {
        inDsl(dsl -> {
            Record h = dsl.fetchOne("select num_dimensions from timescaledb_information.hypertables "
                    + "where hypertable_schema = 'platform' and hypertable_name = 'usage_events'");
            assertThat(h).as("usage_events is a hypertable").isNotNull();
            Record d = dsl.fetchOne("select column_name, time_interval::text from timescaledb_information.dimensions "
                    + "where hypertable_schema = 'platform' and hypertable_name = 'usage_events'");
            assertThat(d.get(0)).isEqualTo("ts");
            assertThat(d.get(1)).isEqualTo("7 days");
            return null;
        });
    }

    @Test
    void oneMinuteOneHourAndOneDayContinuousAggregatesExistAndAreRealTime() throws Exception {
        inDsl(dsl -> {
            List<Record> caggs = dsl.fetch("select view_name, materialized_only from "
                    + "timescaledb_information.continuous_aggregates where view_schema = 'platform' order by view_name");
            assertThat(caggs).extracting(r -> r.get("view_name", String.class))
                    .containsExactly("usage_1d", "usage_1h", "usage_1m");
            assertThat(caggs).allSatisfy(r -> assertThat(r.get("materialized_only", Boolean.class)).isFalse());
            return null;
        });
    }

    @Test
    void refreshAndRetentionPoliciesAreScheduled() throws Exception {
        inDsl(dsl -> {
            var retention = dsl.fetch("select hypertable_name, config->>'drop_after' from timescaledb_information.jobs "
                    + "where proc_name = 'policy_retention' and hypertable_schema = 'platform' order by hypertable_name");
            assertThat(retention.stream().collect(Collectors.toMap(r -> r.get(0, String.class), r -> r.get(1, String.class))))
                    .hasSize(4)
                    .containsEntry("usage_events", "90 days");

            var refresh = dsl.fetch("select hypertable_name from timescaledb_information.jobs "
                    + "where proc_name = 'policy_refresh_continuous_aggregate' and hypertable_schema = 'platform'");
            assertThat(refresh).hasSize(3);
            return null;
        });
    }

    @Test
    void plansAreSeededWithThePhaseOneLimits() throws Exception {
        inDsl(dsl -> {
            var rows = dsl.fetch("select name, requests_per_minute, requests_per_month, max_api_keys, max_webhooks "
                    + "from platform.plans order by requests_per_minute");
            assertThat(rows.map(r -> List.of(r.get(0, String.class), r.get(1, Integer.class), r.get(2, Long.class),
                    r.get(3, Integer.class), r.get(4, Integer.class))))
                    .containsExactly(
                            List.of("FREE", 120, 10_000L, 3, 1),
                            List.of("PRO", 600, 200_000L, 10, 5),
                            List.of("DEVELOPER", 1200, 1_000_000L, 50, 20));
            return null;
        });
    }

    @Test
    void featureFlagsTableEnforcesKeyRolloutAndArrayColumns() throws Exception {
        inDsl(dsl -> {
            assertThat(dsl.fetch("select column_name from information_schema.columns where table_schema = 'platform' "
                    + "and table_name = 'feature_flags' order by ordinal_position").getValues(0, String.class))
                    .containsExactly("key", "description", "enabled", "rollout_percent", "allowed_plans", "allowed_roles",
                            "created_at", "updated_at", "updated_by");
            String insert = "insert into platform.feature_flags (key, description, enabled, rollout_percent, allowed_plans, allowed_roles) "
                    + "values (?, 'd', true, ?, ?::text[], null)";
            assertThat(dsl.execute(insert, "schema-ok", 100, "{PRO,DEVELOPER}")).isEqualTo(1);
            assertThat(dsl.fetchValue("select array_to_string(allowed_plans, ',') from platform.feature_flags where key = 'schema-ok'"))
                    .isEqualTo("PRO,DEVELOPER");
            assertThat(dsl.fetchValue("select allowed_roles is null from platform.feature_flags where key = 'schema-ok'")).isEqualTo(true);

            assertThatThrownBy(() -> dsl.execute(insert, "schema-ok", 10, null)).as("primary key").isInstanceOf(Exception.class);
            assertThatThrownBy(() -> dsl.execute(insert, "schema-low", -1, null)).as("rollout >= 0").isInstanceOf(Exception.class);
            assertThatThrownBy(() -> dsl.execute(insert, "schema-high", 101, null)).as("rollout <= 100").isInstanceOf(Exception.class);
            assertThatThrownBy(() -> dsl.execute(insert, "Bad Key", 10, null)).as("key format").isInstanceOf(Exception.class);
            assertThatThrownBy(() -> dsl.execute(insert, "x".repeat(65), 10, null)).as("key length").isInstanceOf(Exception.class);
            return null;
        });
    }

    @Test
    void flagAuditIsAnAppendOnlyLogThatOutlivesTheFlag() throws Exception {
        inDsl(dsl -> {
            assertThat(dsl.execute("insert into platform.flag_audit (flag_key, action, actor, detail) "
                    + "values ('audit-flag', 'CREATE', 'u1', '{\"enabled\":true}'::jsonb)")).isEqualTo(1);
            assertThat(count(dsl, "select count(*) from platform.flag_audit where flag_key = 'audit-flag' and at is not null"))
                    .isEqualTo(1);
            assertThatThrownBy(() -> dsl.execute("insert into platform.flag_audit (flag_key, action, actor) values ('f', 'EXPLODE', 'u')"))
                    .as("action is constrained").isInstanceOf(Exception.class);
            assertThatThrownBy(() -> dsl.execute("update platform.flag_audit set actor = 'x'"))
                    .as("update refused").isInstanceOf(Exception.class).hasMessageContaining("append-only");
            assertThatThrownBy(() -> dsl.execute("delete from platform.flag_audit"))
                    .as("delete refused").isInstanceOf(Exception.class).hasMessageContaining("append-only");
            assertThatThrownBy(() -> dsl.execute("truncate platform.flag_audit"))
                    .as("truncate refused").isInstanceOf(Exception.class).hasMessageContaining("append-only");
            return null;
        });
    }

    @Test
    void everyGeneratedTableMatchesThePostgresSchema() throws Exception {
        inDsl(dsl -> {
            // plans, usage_events, feature_flags, flag_audit; developer apps and keys (V4, V5); webhooks (V6)
            assertThat(Platform.PLATFORM.getTables()).hasSize(12);
            for (Table<?> t : Platform.PLATFORM.getTables()) {
                dsl.selectFrom(t).limit(0).fetch();   // fails if any generated column is missing in the database
            }
            return null;
        });
    }

    @Test
    void primaryKeyOnEventIdAndTsMakesIngestionIdempotent() throws Exception {
        UUID id = UUID.randomUUID();
        inDsl(dsl -> {
            String insert = "insert into platform.usage_events (event_id, ts, principal_type, principal_id, service, method, "
                    + "route_template, status, latency_ms) values (?, '2031-03-01 10:00:00+00', 'USER', 'u1', 'svc-dedupe', "
                    + "'GET', '/v1/x', 200, 12) on conflict do nothing";
            assertThat(dsl.execute(insert, id)).isEqualTo(1);
            assertThat(dsl.execute(insert, id)).as("duplicates are ignored").isZero();
            assertThat(count(dsl, "select count(*) from platform.usage_events where event_id = ?", id)).isEqualTo(1);
            return null;
        });
    }

    @Test
    void aggregatesRollUpRequestsStatusClassesAndLatencyBucketsBeforeAndAfterMaterialization() throws Exception {
        inDsl(dsl -> {
            // latencies 5, 10 (bucket <=10), 30 (25..50, a rate limited 429), 700 (500..1000), 4000 (> 2500, a 503)
            insert(dsl, "u1", "2031-05-10 12:00:10+00", 200, 5, false);
            insert(dsl, "u1", "2031-05-10 12:00:40+00", 200, 10, false);
            insert(dsl, "u1", "2031-05-10 12:00:50+00", 429, 30, true);
            insert(dsl, "u1", "2031-05-10 12:30:00+00", 200, 700, false);
            insert(dsl, "u1", "2031-05-11 08:00:00+00", 503, 4000, false);

            // row layout: bucket|status class|requests|rate limited|nine disjoint latency bucket counts|sum ms|max ms
            List<String> oneMinute = List.of(
                    "2031-05-10 12:00:00|2|2|0|2,0,0,0,0,0,0,0,0|15|10",
                    "2031-05-10 12:00:00|4|1|1|0,0,1,0,0,0,0,0,0|30|30",
                    "2031-05-10 12:30:00|2|1|0|0,0,0,0,0,0,1,0,0|700|700",
                    "2031-05-11 08:00:00|5|1|0|0,0,0,0,0,0,0,0,1|4000|4000");
            List<String> oneHour = List.of(
                    "2031-05-10 12:00:00|2|3|0|2,0,0,0,0,0,1,0,0|715|700",
                    "2031-05-10 12:00:00|4|1|1|0,0,1,0,0,0,0,0,0|30|30",
                    "2031-05-11 08:00:00|5|1|0|0,0,0,0,0,0,0,0,1|4000|4000");
            List<String> oneDay = List.of(
                    "2031-05-10 00:00:00|2|3|0|2,0,0,0,0,0,1,0,0|715|700",
                    "2031-05-10 00:00:00|4|1|1|0,0,1,0,0,0,0,0,0|30|30",
                    "2031-05-11 00:00:00|5|1|0|0,0,0,0,0,0,0,0,1|4000|4000");

            // 1) real time: nothing is materialized yet, the views aggregate the raw rows on the fly
            assertThat(rollup(dsl, "usage_1m")).isEqualTo(oneMinute);
            assertThat(rollup(dsl, "usage_1h")).isEqualTo(oneHour);
            assertThat(rollup(dsl, "usage_1d")).isEqualTo(oneDay);

            // 2) materialize: same answer, now served from the materialization hypertable
            for (String view : List.of("usage_1m", "usage_1h", "usage_1d")) {
                dsl.execute("call refresh_continuous_aggregate('platform." + view + "', '2031-05-01 00:00:00+00', '2031-06-01 00:00:00+00')");
            }
            assertThat(count(dsl, "select count(*) from " + materializationTable(dsl, "usage_1m"))).isEqualTo(4);
            assertThat(rollup(dsl, "usage_1m")).isEqualTo(oneMinute);
            assertThat(rollup(dsl, "usage_1h")).isEqualTo(oneHour);
            assertThat(rollup(dsl, "usage_1d")).isEqualTo(oneDay);
            return null;
        });
    }

    private static void insert(DSLContext dsl, String principal, String ts, int status, int latencyMs, boolean rateLimited) {
        dsl.execute("insert into platform.usage_events (event_id, ts, principal_type, principal_id, service, method, "
                + "route_template, status, latency_ms, rate_limited) values (?, ?::timestamptz, 'USER', ?, 'svc-roll', 'GET', '/v1/x', ?, ?, ?)",
                UUID.randomUUID(), ts, principal, status, latencyMs, rateLimited);
    }

    private static List<String> rollup(DSLContext dsl, String view) {
        return dsl.fetch("select to_char(bucket at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || '|' || status_class || '|' || requests "
                        + "|| '|' || rate_limited || '|' || concat_ws(',', lat_0_10, lat_10_25, lat_25_50, lat_50_100, lat_100_250, "
                        + "lat_250_500, lat_500_1000, lat_1000_2500, lat_2500_inf) || '|' || latency_sum_ms || '|' || latency_max_ms "
                        + "from platform." + view + " where service = 'svc-roll' order by bucket, status_class")
                .getValues(0, String.class);
    }

    private static String materializationTable(DSLContext dsl, String view) {
        return dsl.fetchValue("select materialization_hypertable_schema || '.' || materialization_hypertable_name "
                + "from timescaledb_information.continuous_aggregates where view_schema = 'platform' and view_name = ?", view)
                .toString();
    }
}
