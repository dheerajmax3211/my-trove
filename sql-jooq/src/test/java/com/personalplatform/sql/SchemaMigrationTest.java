package com.personalplatform.sql;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.sql.jooq.auth.auth.Auth;
import com.personalplatform.sql.jooq.auth.auth.Tables;
import java.sql.Connection;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.jooq.DSLContext;
import org.jooq.SQLDialect;
import org.jooq.Table;
import org.jooq.impl.DSL;
import org.jooq.impl.DefaultConfiguration;
import org.jooq.impl.DefaultExecuteListenerProvider;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Runs the real migrations on real Postgres and checks the generated jOOQ classes against the result.
 * The generator parses the SQL files (it never talks to Postgres), so this catches any drift between
 * what it understood and what Postgres actually built.
 */
@Testcontainers
class SchemaMigrationTest {

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16");

    static DataSource dataSource;

    @BeforeAll
    static void migrate() {
        PGSimpleDataSource ds = new PGSimpleDataSource();
        ds.setUrl(POSTGRES.getJdbcUrl());
        ds.setUser(POSTGRES.getUsername());
        ds.setPassword(POSTGRES.getPassword());
        dataSource = ds;
        Flyway.configure()
                .dataSource(ds)
                .schemas("auth")
                .defaultSchema("auth")
                .locations("classpath:db/migration/auth", "classpath:db/migration/auth_ext")
                .load()
                .migrate();
    }

    private DSLContext dsl(Connection c, List<String> slowLog) {
        var config = new DefaultConfiguration().set(c).set(SQLDialect.POSTGRES);
        config.set(new DefaultExecuteListenerProvider(new SlowQueryListener(Duration.ZERO, slowLog::add)));
        return DSL.using(config);
    }

    @Test
    void everyGeneratedTableMatchesTheDatabase() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c, new ArrayList<>());
            assertThat(Auth.AUTH.getTables()).hasSize(7);
            for (Table<?> table : Auth.AUTH.getTables()) {
                // Selecting every generated column fails if any column is missing or misnamed in Postgres.
                dsl.selectFrom(table).limit(0).fetch();
            }
        }
    }

    @Test
    void seedsPersonaRolesAndDropsLegacyUserRole() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            assertThat(dsl(c, new ArrayList<>()).select(Tables.ROLES.NAME).from(Tables.ROLES).fetch(Tables.ROLES.NAME))
                    .containsExactlyInAnyOrder("OWNER", "ADMIN", "DEVELOPER", "MEMBER", "AUDITOR");
        }
    }

    @Test
    void seedsPermissionCatalogueAndRoleMatrix() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c, new ArrayList<>());
            assertThat(dsl.fetchCount(Tables.PERMISSIONS)).isEqualTo(19);
            assertThat(dsl.select(Tables.ROLE_PERMISSIONS.PERMISSION_NAME).from(Tables.ROLE_PERMISSIONS)
                            .where(Tables.ROLE_PERMISSIONS.ROLE_NAME.eq("MEMBER"))
                            .fetch(Tables.ROLE_PERMISSIONS.PERMISSION_NAME))
                    .containsExactlyInAnyOrder("products:use", "usage:read:self", "connections:manage");
            assertThat(dsl.fetchCount(Tables.ROLE_PERMISSIONS, Tables.ROLE_PERMISSIONS.ROLE_NAME.eq("OWNER")))
                    .isEqualTo(19);
        }
    }

    @Test
    void userDefaultsAreFreePlanVersionOneNotSuspended() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            var row = dsl(c, new ArrayList<>())
                    .insertInto(Tables.USERS)
                    .set(Tables.USERS.FIREBASE_UID, "plan-defaults")
                    .returning(Tables.USERS.PLAN, Tables.USERS.PERMISSIONS_VERSION, Tables.USERS.SUSPENDED_AT)
                    .fetchOne();
            assertThat(row.getPlan()).isEqualTo("FREE");
            assertThat(row.getPermissionsVersion()).isEqualTo(1);
            assertThat(row.getSuspendedAt()).isNull();
        }
    }

    @Test
    void auditLogIsAppendOnly() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c, new ArrayList<>());
            UUID id = UuidV7.next();
            dsl.insertInto(Tables.AUDIT_LOG).set(Tables.AUDIT_LOG.ID, id).set(Tables.AUDIT_LOG.ACTION, "TEST").execute();
            assertThatThrownBy(() -> dsl.update(Tables.AUDIT_LOG).set(Tables.AUDIT_LOG.ACTION, "X")
                            .where(Tables.AUDIT_LOG.ID.eq(id)).execute())
                    .hasMessageContaining("append-only");
            assertThatThrownBy(() -> dsl.deleteFrom(Tables.AUDIT_LOG).where(Tables.AUDIT_LOG.ID.eq(id)).execute())
                    .hasMessageContaining("append-only");
            assertThatThrownBy(() -> dsl.execute("truncate auth.audit_log")).hasMessageContaining("append-only");
        }
    }

    @Test
    void onlyOneSigningKeyCanBeActive() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c, new ArrayList<>());
            dsl.deleteFrom(Tables.SIGNING_KEYS).execute();
            Runnable insert = () -> dsl.insertInto(Tables.SIGNING_KEYS)
                    .set(Tables.SIGNING_KEYS.KID, UUID.randomUUID().toString())
                    .set(Tables.SIGNING_KEYS.ALGORITHM, "RS256")
                    .set(Tables.SIGNING_KEYS.STATUS, "ACTIVE")
                    .set(Tables.SIGNING_KEYS.PUBLIC_JWK, "{}")
                    .set(Tables.SIGNING_KEYS.PRIVATE_KEY_ENC, new byte[] {1})
                    .set(Tables.SIGNING_KEYS.ENC_ALG, "test")
                    .set(Tables.SIGNING_KEYS.CREATED_AT, java.time.OffsetDateTime.now())
                    .execute();
            insert.run();
            assertThatThrownBy(insert::run).hasMessageContaining("signing_keys_one_active");
            dsl.deleteFrom(Tables.SIGNING_KEYS).execute();
        }
    }

    @Test
    void databaseGeneratesIdAndTimestampDefaults() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            var row = dsl(c, new ArrayList<>())
                    .insertInto(Tables.USERS)
                    .set(Tables.USERS.FIREBASE_UID, "default-check")
                    .returning(Tables.USERS.ID, Tables.USERS.CREATED_AT)
                    .fetchOne();
            assertThat(row.getId()).isNotNull();
            assertThat(row.getCreatedAt()).isNotNull();
        }
    }

    @Test
    void slowQueryListenerReportsSqlWithoutBindValues() throws Exception {
        List<String> reported = new ArrayList<>();
        try (Connection c = dataSource.getConnection()) {
            dsl(c, reported).selectFrom(Tables.USERS).where(Tables.USERS.EMAIL.eq("secret@example.com")).fetch();
        }
        assertThat(reported).hasSize(1);
        assertThat(reported.get(0)).contains("Slow query", "\"auth\".\"users\"").doesNotContain("secret@example.com");
    }
}
