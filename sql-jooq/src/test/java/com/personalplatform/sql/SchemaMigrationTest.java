package com.personalplatform.sql;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.sql.jooq.auth.auth.Auth;
import com.personalplatform.sql.jooq.auth.auth.Tables;
import java.sql.Connection;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
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
                .locations("classpath:db/migration/auth")
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
            assertThat(Auth.AUTH.getTables()).hasSize(3);
            for (Table<?> table : Auth.AUTH.getTables()) {
                // Selecting every generated column fails if any column is missing or misnamed in Postgres.
                dsl.selectFrom(table).limit(0).fetch();
            }
        }
    }

    @Test
    void seedsBaselineRoles() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            assertThat(dsl(c, new ArrayList<>()).select(Tables.ROLES.NAME).from(Tables.ROLES).fetch(Tables.ROLES.NAME))
                    .contains("USER", "ADMIN");
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
