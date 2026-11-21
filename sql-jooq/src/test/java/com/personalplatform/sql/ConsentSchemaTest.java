package com.personalplatform.sql;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.sql.jooq.consent.consent.Consent;
import com.personalplatform.sql.jooq.consent.consent.Tables;
import java.sql.Connection;
import java.time.OffsetDateTime;
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

/**
 * Runs both consent migration locations (generator-parsed `consent` plus the generator-invisible `consent_ext` with the
 * append-only trigger) and checks the generated jOOQ classes against the real database.
 */
@Testcontainers
class ConsentSchemaTest {

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
                .schemas("consent")
                .defaultSchema("consent")
                .locations("classpath:db/migration/consent", "classpath:db/migration/consent_ext")
                .load()
                .migrate();
    }

    private static DSLContext dsl(Connection c) {
        return DSL.using(c, SQLDialect.POSTGRES);
    }

    @Test
    void everyGeneratedTableMatchesTheDatabase() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            assertThat(Consent.CONSENT.getTables()).hasSize(8);
            for (Table<?> table : Consent.CONSENT.getTables()) {
                dsl.selectFrom(table).limit(0).fetch();
            }
        }
    }

    @Test
    void auditLogIsAppendOnly() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            dsl.insertInto(Tables.AUDIT_LOG)
                    .set(Tables.AUDIT_LOG.OWNER_UID, "o")
                    .set(Tables.AUDIT_LOG.OWNER_SEQ, 1L)
                    .set(Tables.AUDIT_LOG.EVENT_TYPE, "E")
                    .set(Tables.AUDIT_LOG.ACTOR_TYPE, "OWNER")
                    .set(Tables.AUDIT_LOG.ACTOR_ID, "o")
                    .set(Tables.AUDIT_LOG.DETAIL, "{}")
                    .set(Tables.AUDIT_LOG.OCCURRED_AT, OffsetDateTime.now())
                    .set(Tables.AUDIT_LOG.PREV_HASH, "0".repeat(64))
                    .set(Tables.AUDIT_LOG.ENTRY_HASH, "a".repeat(64))
                    .execute();
            assertThatThrownBy(() -> dsl.update(Tables.AUDIT_LOG).set(Tables.AUDIT_LOG.DETAIL, "x").execute())
                    .hasMessageContaining("append-only");
            assertThatThrownBy(() -> dsl.deleteFrom(Tables.AUDIT_LOG).execute()).hasMessageContaining("append-only");
            assertThatThrownBy(() -> dsl.execute("truncate table consent.audit_log")).hasMessageContaining("append-only");
        }
    }

    @Test
    void atMostOneSigningKeyCanBeActive() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            insertKey(dsl, "kid-1", "ACTIVE");
            insertKey(dsl, "kid-2", "RETIRED");
            insertKey(dsl, "kid-3", "RETIRED");
            assertThatThrownBy(() -> insertKey(dsl, "kid-4", "ACTIVE")).hasMessageContaining("signing_keys_one_active");
        }
    }

    private static void insertKey(DSLContext dsl, String kid, String status) {
        dsl.insertInto(Tables.SIGNING_KEYS)
                .set(Tables.SIGNING_KEYS.KID, kid)
                .set(Tables.SIGNING_KEYS.ALGORITHM, "RS256")
                .set(Tables.SIGNING_KEYS.STATUS, status)
                .set(Tables.SIGNING_KEYS.PUBLIC_JWK, "{}")
                .set(Tables.SIGNING_KEYS.PRIVATE_KEY_ENC, new byte[] {1})
                .set(Tables.SIGNING_KEYS.ENC_ALG, "x")
                .set(Tables.SIGNING_KEYS.CREATED_AT, OffsetDateTime.now())
                .execute();
    }

    @Test
    void grantsAndRequestsEnforceStatusDomains() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            assertThatThrownBy(() -> dsl.insertInto(Tables.ATTRIBUTES)
                            .set(Tables.ATTRIBUTES.ID, UuidV7.next())
                            .set(Tables.ATTRIBUTES.OWNER_UID, "o")
                            .set(Tables.ATTRIBUTES.KEY_PATH, "a.b")
                            .set(Tables.ATTRIBUTES.VALUE, org.jooq.JSON.valueOf("1"))
                            .set(Tables.ATTRIBUTES.SENSITIVITY, "TOP_SECRET")
                            .set(Tables.ATTRIBUTES.CREATED_AT, OffsetDateTime.now())
                            .set(Tables.ATTRIBUTES.UPDATED_AT, OffsetDateTime.now())
                            .execute())
                    .hasMessageContaining("sensitivity");
        }
    }
}
