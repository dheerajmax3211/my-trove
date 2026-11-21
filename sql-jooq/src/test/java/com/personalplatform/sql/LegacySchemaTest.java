package com.personalplatform.sql;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.sql.jooq.legacy.legacy.Legacy;
import com.personalplatform.sql.jooq.legacy.legacy.Tables;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.jooq.DSLContext;
import org.jooq.JSONB;
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
 * Runs the real legacy migrations (main folder + the plpgsql {@code legacy_ext} folder, one shared history table)
 * on real Postgres, checks the generated jOOQ classes against it, and proves the audit trail is append-only,
 * hash-chained and tamper-evident AT THE DATABASE.
 */
@Testcontainers
class LegacySchemaTest {

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
        var result = Flyway.configure()
                .dataSource(ds)
                .schemas("legacy")
                .defaultSchema("legacy")
                .locations("classpath:db/migration/legacy", "classpath:db/migration/legacy_ext")
                .load()
                .migrate();
        assertThat(result.migrationsExecuted).isEqualTo(2);
    }

    private DSLContext dsl(Connection c) {
        return DSL.using(c, SQLDialect.POSTGRES);
    }

    private UUID newVault(DSLContext dsl) {
        UUID id = UuidV7.next();
        dsl.insertInto(Tables.VAULTS)
                .set(Tables.VAULTS.ID, id)
                .set(Tables.VAULTS.OWNER_UID, "owner-" + id)
                .set(Tables.VAULTS.CIPHERTEXT, new byte[] {1, 2, 3, 4})
                .set(Tables.VAULTS.CIPHERTEXT_SHA256, new byte[32])
                .set(Tables.VAULTS.METADATA, JSONB.jsonb("{}"))
                .execute();
        return id;
    }

    private void audit(DSLContext dsl, UUID vault, String event) {
        dsl.insertInto(Tables.AUDIT_LOG)
                .set(Tables.AUDIT_LOG.ID, UuidV7.next())
                .set(Tables.AUDIT_LOG.VAULT_ID, vault)
                .set(Tables.AUDIT_LOG.AT, OffsetDateTime.parse("2030-01-01T00:00:00.123456Z"))
                .set(Tables.AUDIT_LOG.ACTOR_KIND, "OWNER")
                .set(Tables.AUDIT_LOG.ACTOR_ID, "alice")
                .set(Tables.AUDIT_LOG.EVENT_TYPE, event)
                .set(Tables.AUDIT_LOG.DETAIL, JSONB.jsonb("{\"k\": \"v\"}"))
                .execute();
    }

    @Test
    void everyGeneratedTableMatchesTheDatabase() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            assertThat(Legacy.LEGACY.getTables()).hasSize(6);
            for (Table<?> table : Legacy.LEGACY.getTables()) {
                dsl.selectFrom(table).limit(0).fetch(); // fails on any missing or misnamed column
            }
        }
    }

    @Test
    void bothFlywayLocationsShareOneHistoryTable() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            List<String> versions = dsl(c).fetch("select version from legacy.flyway_schema_history order by installed_rank")
                    .getValues(0, String.class);
            assertThat(versions).contains("1", "100");
        }
    }

    @Test
    void triggerAssignsSequenceAndChainWhateverTheClientSends() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            UUID vault = newVault(dsl);
            // a client that tries to forge its own sequence/hash values is simply overwritten
            dsl.insertInto(Tables.AUDIT_LOG)
                    .set(Tables.AUDIT_LOG.ID, UuidV7.next()).set(Tables.AUDIT_LOG.VAULT_ID, vault)
                    .set(Tables.AUDIT_LOG.VAULT_SEQ, 999L)
                    .set(Tables.AUDIT_LOG.AT, OffsetDateTime.now()).set(Tables.AUDIT_LOG.ACTOR_KIND, "OWNER")
                    .set(Tables.AUDIT_LOG.ACTOR_ID, "mallory").set(Tables.AUDIT_LOG.EVENT_TYPE, "FORGED")
                    .set(Tables.AUDIT_LOG.PREV_HASH, new byte[] {9}).set(Tables.AUDIT_LOG.HASH, new byte[] {9})
                    .execute();
            audit(dsl, vault, "SECOND");
            var rows = dsl.selectFrom(Tables.AUDIT_LOG).where(Tables.AUDIT_LOG.VAULT_ID.eq(vault))
                    .orderBy(Tables.AUDIT_LOG.VAULT_SEQ).fetch();
            assertThat(rows.get(0).getVaultSeq()).isEqualTo(1L);
            assertThat(rows.get(0).getPrevHash()).isEqualTo(new byte[32]);
            assertThat(rows.get(0).getHash()).hasSize(32).isNotEqualTo(new byte[] {9});
            assertThat(rows.get(1).getVaultSeq()).isEqualTo(2L);
            assertThat(rows.get(1).getPrevHash()).isEqualTo(rows.get(0).getHash());
            var v = dsl.fetch("select * from legacy.verify_audit_chain(?)", vault).get(0);
            assertThat(v.get("ok", Boolean.class)).isTrue();
            assertThat(v.get("length", Long.class)).isEqualTo(2L);
        }
    }

    @Test
    void chainsAreIndependentPerVault() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            UUID a = newVault(dsl);
            UUID b = newVault(dsl);
            audit(dsl, a, "E1");
            audit(dsl, b, "E1");
            audit(dsl, a, "E2");
            assertThat(dsl.fetchValue("select max(vault_seq) from legacy.audit_log where vault_id = ?", a)).isEqualTo(2L);
            assertThat(dsl.fetchValue("select max(vault_seq) from legacy.audit_log where vault_id = ?", b)).isEqualTo(1L);
        }
    }

    @Test
    void updateDeleteAndTruncateAreRejectedByTheDatabase() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            UUID vault = newVault(dsl);
            audit(dsl, vault, "KEEP");
            assertThatThrownBy(() -> dsl.update(Tables.AUDIT_LOG).set(Tables.AUDIT_LOG.EVENT_TYPE, "EDITED")
                    .where(Tables.AUDIT_LOG.VAULT_ID.eq(vault)).execute()).hasMessageContaining("append-only");
            assertThatThrownBy(() -> dsl.deleteFrom(Tables.AUDIT_LOG).where(Tables.AUDIT_LOG.VAULT_ID.eq(vault)).execute())
                    .hasMessageContaining("append-only");
            assertThatThrownBy(() -> dsl.execute("truncate table legacy.audit_log")).hasMessageContaining("append-only");
            assertThatThrownBy(() -> dsl.execute("delete from legacy.audit_log")).hasMessageContaining("append-only");
            assertThat(dsl.fetchCount(Tables.AUDIT_LOG, Tables.AUDIT_LOG.VAULT_ID.eq(vault))).isEqualTo(1);
        }
    }

    @Test
    void directTamperingByATriggerBypassingAdminIsDetectedByTheHashChain() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            UUID vault = newVault(dsl);
            audit(dsl, vault, "A");
            audit(dsl, vault, "B");
            audit(dsl, vault, "C");
            assertThat(dsl.fetchOne("select ok from legacy.verify_audit_chain(?)", vault).get(0, Boolean.class)).isTrue();
            // an admin who disables the guard trigger and edits history leaves a broken chain behind
            try (Statement st = c.createStatement()) {
                st.execute("alter table legacy.audit_log disable trigger audit_log_no_update_delete");
                try {
                    st.execute("update legacy.audit_log set event_type = 'TAMPERED' where vault_id = '" + vault
                            + "' and vault_seq = 2");
                } finally {
                    st.execute("alter table legacy.audit_log enable trigger audit_log_no_update_delete");
                }
            }
            var v = dsl.fetchOne("select * from legacy.verify_audit_chain(?)", vault);
            assertThat(v.get("ok", Boolean.class)).isFalse();
            assertThat(v.get("first_bad_seq", Long.class)).isEqualTo(2L);
            assertThat(v.get("length", Long.class)).isEqualTo(3L);
        }
    }

    @Test
    void concurrentAppendsToOneVaultProduceAGaplessVerifiableChain() throws Exception {
        UUID vault;
        try (Connection c = dataSource.getConnection()) {
            vault = newVault(dsl(c));
        }
        ExecutorService pool = Executors.newFixedThreadPool(4);
        try {
            List<Callable<Void>> jobs = new ArrayList<>();
            for (int t = 0; t < 4; t++) {
                jobs.add(() -> {
                    try (Connection c = dataSource.getConnection()) {
                        DSLContext dsl = dsl(c);
                        for (int i = 0; i < 15; i++) {
                            audit(dsl, vault, "E");
                        }
                    }
                    return null;
                });
            }
            for (Future<Void> f : pool.invokeAll(jobs)) {
                f.get();
            }
        } finally {
            pool.shutdownNow();
        }
        try (Connection c = dataSource.getConnection()) {
            var v = dsl(c).fetchOne("select * from legacy.verify_audit_chain(?)", vault);
            assertThat(v.get("ok", Boolean.class)).isTrue();
            assertThat(v.get("length", Long.class)).isEqualTo(60L);
        }
    }

    @Test
    void constraintsGuardTheProtocolInvariants() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            UUID vault = newVault(dsl);
            // one vault per owner
            assertThatThrownBy(() -> dsl.insertInto(Tables.VAULTS).set(Tables.VAULTS.ID, UuidV7.next())
                    .set(Tables.VAULTS.OWNER_UID, "owner-" + vault).set(Tables.VAULTS.CIPHERTEXT, new byte[] {1})
                    .set(Tables.VAULTS.CIPHERTEXT_SHA256, new byte[32]).set(Tables.VAULTS.METADATA, JSONB.jsonb("{}"))
                    .execute()).hasMessageContaining("vaults_owner_uk");
            // states are a closed set
            assertThatThrownBy(() -> dsl.update(Tables.VAULTS).set(Tables.VAULTS.STATE, "BOGUS")
                    .where(Tables.VAULTS.ID.eq(vault)).execute()).hasMessageContaining("vaults_state_ck");
            // cannot be armed without a policy
            assertThatThrownBy(() -> dsl.update(Tables.VAULTS).set(Tables.VAULTS.ARMED, true)
                    .where(Tables.VAULTS.ID.eq(vault)).execute()).hasMessageContaining("vaults_armed_ck");
            // a trustee can vote once per incident
            UUID trustee = UuidV7.next();
            dsl.insertInto(Tables.TRUSTEES).set(Tables.TRUSTEES.ID, trustee).set(Tables.TRUSTEES.VAULT_ID, vault)
                    .set(Tables.TRUSTEES.LABEL, "t").set(Tables.TRUSTEES.INVITE_TOKEN_HASH, "h" + trustee)
                    .set(Tables.TRUSTEES.INVITE_EXPIRES_AT, OffsetDateTime.now().plusDays(1)).execute();
            Runnable vote = () -> dsl.insertInto(Tables.APPROVALS).set(Tables.APPROVALS.ID, UuidV7.next())
                    .set(Tables.APPROVALS.VAULT_ID, vault).set(Tables.APPROVALS.EPOCH, 1)
                    .set(Tables.APPROVALS.TRUSTEE_ID, trustee).set(Tables.APPROVALS.DECISION, "APPROVE")
                    .set(Tables.APPROVALS.DECIDED_AT, OffsetDateTime.now()).execute();
            vote.run();
            assertThatThrownBy(vote::run).hasMessageContaining("approvals_vote_uk");
            // escalation steps are unique per incident
            Runnable step = () -> dsl.insertInto(Tables.ESCALATION_STEPS).set(Tables.ESCALATION_STEPS.VAULT_ID, vault)
                    .set(Tables.ESCALATION_STEPS.EPOCH, 1).set(Tables.ESCALATION_STEPS.STEP_INDEX, 0)
                    .set(Tables.ESCALATION_STEPS.EXECUTED_AT, OffsetDateTime.now()).execute();
            step.run();
            assertThatThrownBy(step::run).isInstanceOf(org.jooq.exception.DataAccessException.class);
        } catch (SQLException e) {
            throw e;
        }
    }
}
