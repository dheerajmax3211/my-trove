package com.personalplatform.askyourlife.rls;

import com.personalplatform.askyourlife.support.Q;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.askyourlife.document.SourceType;
import com.personalplatform.askyourlife.support.AbstractIntegrationTest;
import com.personalplatform.askyourlife.support.PgVectorContainerConfig;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * RLS is only meaningful if the connection is NOT a superuser (superusers bypass it). These tests therefore run as
 * the non-superuser ask_life_app role, both through the application's OwnerScope (SET LOCAL ROLE) and over a
 * genuine login connection with hand-written SQL.
 */
class RlsIsolationTest extends AbstractIntegrationTest {

    @Autowired OwnerScope scope;

    private UUID aliceDoc;
    private UUID bobDoc;

    @BeforeEach
    void data() {
        aliceDoc = ingestAndIndex("alice", "Alice diary", "alice secret garden plans with many words", SourceType.NOTE);
        bobDoc = ingestAndIndex("bob", "Bob diary", "bob secret bunker plans with many words", SourceType.NOTE);
    }

    private long countWithoutOwner(String table) {
        Long n = scope.callWithoutOwner(dsl -> Q.val(dsl, "select count(*) from ask_life." + table, Long.class));
        return n;
    }

    private long countAs(String owner, String sql, Object... binds) {
        Long n = scope.call(owner, dsl -> Q.val(dsl, sql, Long.class, binds));
        return n;
    }

    private Connection appRoleConnection() throws SQLException {
        var pg = PgVectorContainerConfig.container();
        try (Connection admin = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
                Statement st = admin.createStatement()) {
            st.execute("alter role ask_life_app login password 'app-test-password'");
        }
        return DriverManager.getConnection(pg.getJdbcUrl(), "ask_life_app", "app-test-password");
    }

    private static long scalar(Connection c, String sql) throws SQLException {
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getLong(1);
        }
    }

    private static List<String> column(Connection c, String sql) throws SQLException {
        List<String> out = new ArrayList<>();
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                out.add(rs.getString(1));
            }
        }
        return out;
    }

    @Test
    void thePremiseHolds_theTestSuperuserBypassesRlsAndTheAppRoleDoesNot() throws Exception {
        assertThat(count("chunks")).isEqualTo(2); // superuser sees everyone
        assertThat(Q.val(superDsl, "select rolsuper from pg_roles where rolname = current_user", Boolean.class)).isTrue();
        assertThat(Q.val(superDsl, "select rolsuper or rolbypassrls from pg_roles where rolname = 'ask_life_app'", Boolean.class)).isFalse();
        assertThat(Q.val(superDsl, "select count(*) from pg_class where relnamespace = 'ask_life'::regnamespace "
                + "and relname in ('documents','chunks') and relrowsecurity and relforcerowsecurity", Long.class)).isEqualTo(2);
    }

    @Test
    void aQueryWithoutSettingTheOwnerReturnsNothing() {
        assertThat(countWithoutOwner("documents")).isZero();
        assertThat(countWithoutOwner("chunks")).isZero();
    }

    @Test
    void theAppRoleCannotReadAnotherOwnersRowsEvenWithHandWrittenSql() throws Exception {
        try (Connection c = appRoleConnection()) {
            // 1. no owner set: nothing at all
            assertThat(scalar(c, "select count(*) from ask_life.chunks")).isZero();
            assertThat(scalar(c, "select count(*) from ask_life.documents")).isZero();

            // 2. as alice: only alice's rows, whatever the query says
            c.setAutoCommit(false);
            try (Statement st = c.createStatement()) {
                st.execute("select set_config('app.owner_uid', 'alice', true)");
            }
            assertThat(column(c, "select distinct owner_uid from ask_life.chunks")).containsExactly("alice");
            assertThat(scalar(c, "select count(*) from ask_life.chunks where owner_uid = 'bob'")).isZero();
            assertThat(scalar(c, "select count(*) from ask_life.chunks where document_id = '" + bobDoc + "'")).isZero();
            assertThat(scalar(c, "select count(*) from ask_life.documents where id = '" + bobDoc + "'")).isZero();
            assertThat(column(c, "select content from ask_life.chunks")).allMatch(t -> t.startsWith("alice"));
            // joins and subqueries cannot smuggle rows out either
            assertThat(scalar(c, "select count(*) from ask_life.documents d join ask_life.chunks k on k.document_id = d.id where d.owner_uid <> 'alice'")).isZero();

            // 3. writes against another owner are refused or no-ops
            try (Statement st = c.createStatement()) {
                assertThat(st.executeUpdate("update ask_life.documents set title = 'pwned' where id = '" + bobDoc + "'")).isZero();
                assertThat(st.executeUpdate("delete from ask_life.chunks where document_id = '" + bobDoc + "'")).isZero();
                assertThatThrownBy(() -> st.execute("insert into ask_life.documents (id, owner_uid, source_type, title, mime_type, content_hash, "
                        + "content, status, created_at, updated_at) values ('" + UUID.randomUUID() + "', 'bob', 'NOTE', 'x', 'text/plain', '"
                        + "0".repeat(64) + "', 'x', 'PENDING', now(), now())"))
                        .isInstanceOf(SQLException.class).hasMessageContaining("row-level security");
            }
            c.rollback();

            // 4. the setting was transaction-local: a new transaction is back to "no owner"
            assertThat(scalar(c, "select count(*) from ask_life.chunks")).isZero();
            c.rollback();
        }
        // ground truth: nothing of bob's changed
        assertThat(Q.val(superDsl, "select title from ask_life.documents where id = ?", String.class, bobDoc)).isEqualTo("Bob diary");
        assertThat(count("chunks")).isEqualTo(2);
    }

    @Test
    void theApplicationScopeSeesOnlyTheCallersRows() {
        List<String> owners = scope.call("alice", dsl -> Q.vals(dsl, "select owner_uid from ask_life.chunks", String.class));
        assertThat(owners).isNotEmpty().containsOnly("alice");
        assertThat(countAs("bob", "select count(*) from ask_life.documents where id = ?", aliceDoc)).isZero();
        assertThat(countAs("carol", "select count(*) from ask_life.documents")).isZero();
    }

    @Test
    void policyWithCheckStopsTheApplicationWritingAsSomeoneElse() {
        assertThatThrownBy(() -> scope.run("alice", dsl -> dsl.execute(
                "insert into ask_life.documents (id, owner_uid, source_type, title, mime_type, content_hash, content, status, created_at, updated_at) "
                        + "values (?, 'bob', 'NOTE', 'x', 'text/plain', ?, 'x', 'PENDING', now(), now())", UUID.randomUUID(), "1".repeat(64))))
                .hasStackTraceContaining("row-level security");
    }

    @Test
    void ownerDoesNotLeakAcrossPooledConnectionsOrTransactions() {
        for (int i = 0; i < 30; i++) {
            assertThat(countAs("alice", "select count(*) from ask_life.documents")).isEqualTo(1);
            assertThat(countWithoutOwner("documents")).isZero();
            String user = scope.callWithoutOwner(dsl -> Q.val(dsl, "select current_user", String.class));
            assertThat(user).isEqualTo("ask_life_app");
        }
    }

    @Test
    void aTransactionCannotBeRescopedToADifferentOwner() {
        assertThatThrownBy(() -> scope.run("alice", dsl -> scope.run("bob", d -> {})))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("different owner");
    }

    @Test
    void ownerIsRequired() {
        assertThatThrownBy(() -> scope.call(" ", dsl -> 1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> scope.call(null, dsl -> 1)).isInstanceOf(IllegalArgumentException.class);
    }
}
