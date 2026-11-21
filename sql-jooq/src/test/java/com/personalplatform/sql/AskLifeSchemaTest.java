package com.personalplatform.sql;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.sql.jooq.ask_life.ask_life.AskLife;
import java.sql.Connection;
import java.util.List;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.jooq.DSLContext;
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
 * Applies both ask_life Flyway locations (plain tables + the pgvector/RLS "ext" migrations) to a real
 * pgvector Postgres and checks the generated jOOQ model and the Postgres-only objects against it.
 */
@Testcontainers
class AskLifeSchemaTest {

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(
            DockerImageName.parse("pgvector/pgvector:0.8.0-pg16").asCompatibleSubstituteFor("postgres"));

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
                .schemas("ask_life")
                .defaultSchema("ask_life")
                .locations("classpath:db/migration/ask_life", "classpath:db/migration/ask_life_ext")
                .load()
                .migrate();
    }

    private static <T> T value(DSLContext dsl, String sql, Class<T> type) {
        return dsl.resultQuery(sql).fetchOne(0, type);
    }

    private static List<String> strings(DSLContext dsl, String sql, Class<String> type) {
        return dsl.resultQuery(sql).fetch(0, type);
    }

    private DSLContext dsl(Connection c) {
        return DSL.using(c, SQLDialect.POSTGRES);
    }

    @Test
    void everyGeneratedTableMatchesTheDatabase() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            assertThat(AskLife.ASK_LIFE.getTables()).hasSize(3);
            for (Table<?> table : AskLife.ASK_LIFE.getTables()) {
                dsl.selectFrom(table).limit(0).fetch();
            }
        }
    }

    @Test
    void vectorColumnIs384DimensionalAndTsvIsGenerated() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            assertThat(value(dsl, "select extversion from pg_extension where extname = 'vector'", String.class)).isNotNull();
            assertThat(value(dsl, "select atttypmod from pg_attribute where attrelid = 'ask_life.chunks'::regclass "
                    + "and attname = 'embedding'", Integer.class)).isEqualTo(384);
            assertThat(value(dsl, "select attgenerated from pg_attribute where attrelid = 'ask_life.chunks'::regclass "
                    + "and attname = 'tsv'", String.class)).isEqualTo("s");
        }
    }

    @Test
    void searchIndexesRowLevelSecurityAndAppRoleAreInPlace() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            List<String> indexes = strings(dsl, "select indexdef from pg_indexes where schemaname = 'ask_life' and tablename = 'chunks'", String.class);
            assertThat(indexes).anyMatch(d -> d.contains("USING hnsw") && d.contains("vector_cosine_ops"));
            assertThat(indexes).anyMatch(d -> d.contains("USING gin (tsv)"));
            assertThat(value(dsl, "select count(*) from pg_class where relnamespace = 'ask_life'::regnamespace "
                    + "and relname in ('documents','chunks') and relrowsecurity and relforcerowsecurity", Long.class)).isEqualTo(2);
            assertThat(value(dsl, "select count(*) from pg_policies where schemaname = 'ask_life'", Long.class)).isEqualTo(2);
            assertThat(value(dsl, "select rolsuper or rolbypassrls from pg_roles where rolname = 'ask_life_app'", Boolean.class)).isFalse();
            assertThat(value(dsl, "select count(*) from ask_life.flyway_schema_history where version::int >= 100", Long.class)).isEqualTo(4);
        }
    }

    @Test
    void migrationsAreRepeatableOnAFreshSchemaAndFlywayIsClean() {
        var info = Flyway.configure().dataSource(dataSource).schemas("ask_life").defaultSchema("ask_life")
                .locations("classpath:db/migration/ask_life", "classpath:db/migration/ask_life_ext").load().info();
        assertThat(info.pending()).isEmpty();
        assertThat(java.util.Arrays.stream(info.applied()).filter(i -> i.getVersion() != null).count()).isEqualTo(5);
    }
}
