package com.personalplatform.sql;

import static com.personalplatform.sql.jooq.mcp.mcp.Tables.TOOL_CALLS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.sql.jooq.mcp.mcp.Mcp;
import java.sql.Connection;
import java.util.UUID;
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

/** Runs both mcp Flyway locations on real Postgres, checks the generated classes and that the audit is append-only. */
@Testcontainers
class McpSchemaTest {

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
                .schemas("mcp")
                .defaultSchema("mcp")
                .locations("classpath:db/migration/mcp", "classpath:db/migration/mcp_ext")
                .load()
                .migrate();
    }

    private static UUID insert(DSLContext dsl, String outcome) {
        UUID id = UuidV7.next();
        dsl.insertInto(TOOL_CALLS)
                .set(TOOL_CALLS.ID, id)
                .set(TOOL_CALLS.PRINCIPAL_TYPE, "USER")
                .set(TOOL_CALLS.PRINCIPAL_ID, "uid-1")
                .set(TOOL_CALLS.TOOL, "waiting_on_list_followups")
                .set(TOOL_CALLS.ARGUMENTS_HASH, "0".repeat(64))
                .set(TOOL_CALLS.RESULT_BYTES, 10)
                .set(TOOL_CALLS.OUTCOME, outcome)
                .set(TOOL_CALLS.DURATION_MS, 3)
                .execute();
        return id;
    }

    @Test
    void generatedTablesMatchTheDatabase() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = DSL.using(c, SQLDialect.POSTGRES);
            assertThat(Mcp.MCP.getTables()).hasSize(1);
            for (Table<?> table : Mcp.MCP.getTables()) {
                dsl.selectFrom(table).limit(0).fetch();
            }
        }
    }

    @Test
    void toolCallsAreAppendOnlyAndOutcomesAreChecked() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = DSL.using(c, SQLDialect.POSTGRES);
            UUID id = insert(dsl, "OK");
            assertThat(dsl.fetchOne(TOOL_CALLS, TOOL_CALLS.ID.eq(id)).getCalledAt()).isNotNull();
            assertThatThrownBy(() -> dsl.update(TOOL_CALLS).set(TOOL_CALLS.OUTCOME, "ERROR")
                    .where(TOOL_CALLS.ID.eq(id)).execute()).hasMessageContaining("append-only");
            assertThatThrownBy(() -> dsl.deleteFrom(TOOL_CALLS).where(TOOL_CALLS.ID.eq(id)).execute())
                    .hasMessageContaining("append-only");
            assertThatThrownBy(() -> dsl.execute("truncate mcp.tool_calls")).hasMessageContaining("append-only");
            assertThatThrownBy(() -> insert(dsl, "MAYBE")).hasMessageContaining("tool_calls_outcome_check");
        }
    }
}
