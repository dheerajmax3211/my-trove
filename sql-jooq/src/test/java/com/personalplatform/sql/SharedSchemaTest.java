package com.personalplatform.sql;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.sql.jooq.shared.shared.Shared;
import com.personalplatform.sql.jooq.shared.shared.Tables;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.UUID;
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
 * Applies BOTH shared migration locations (the jOOQ-parsed {@code shared/} and the plpgsql-only {@code shared_ext/}),
 * checks every generated table against the real database, and proves the audit trigger rejects mutation.
 */
@Testcontainers
class SharedSchemaTest {

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
                .schemas("shared")
                .defaultSchema("shared")
                .locations("classpath:db/migration/shared", "classpath:db/migration/shared_ext")
                .load()
                .migrate();
    }

    @Test
    void everyGeneratedTableMatchesTheDatabase() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = DSL.using(c, SQLDialect.POSTGRES);
            assertThat(Shared.SHARED.getTables()).hasSize(8);
            for (Table<?> table : Shared.SHARED.getTables()) {
                dsl.selectFrom(table).limit(0).fetch(); // fails if any generated column is missing in Postgres
            }
        }
    }

    @Test
    void outboxRowsCanBeEmailOnlyWithoutAReminderAndDuplicatesAreRejected() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = DSL.using(c, SQLDialect.POSTGRES);
            String key = "test:" + UUID.randomUUID();
            OffsetDateTime now = OffsetDateTime.now();
            dsl.insertInto(Tables.NOTIFICATIONS)
                    .set(Tables.NOTIFICATIONS.ID, UuidV7.next())
                    .set(Tables.NOTIFICATIONS.RECIPIENT_EMAIL, "counterparty@example.test")
                    .set(Tables.NOTIFICATIONS.KIND, "WAITING_NUDGE")
                    .set(Tables.NOTIFICATIONS.SOURCE, "waiting-on")
                    .set(Tables.NOTIFICATIONS.IN_APP, false)
                    .set(Tables.NOTIFICATIONS.DEDUPE_KEY, key)
                    .set(Tables.NOTIFICATIONS.TITLE, "Hello")
                    .set(Tables.NOTIFICATIONS.OCCURRENCE_AT, now)
                    .set(Tables.NOTIFICATIONS.NEXT_ATTEMPT_AT, now)
                    .set(Tables.NOTIFICATIONS.CREATED_AT, now)
                    .execute();
            assertThatThrownBy(() -> dsl.insertInto(Tables.NOTIFICATIONS)
                    .set(Tables.NOTIFICATIONS.ID, UuidV7.next())
                    .set(Tables.NOTIFICATIONS.RECIPIENT_EMAIL, "counterparty@example.test")
                    .set(Tables.NOTIFICATIONS.DEDUPE_KEY, key)
                    .set(Tables.NOTIFICATIONS.TITLE, "Hello again")
                    .set(Tables.NOTIFICATIONS.OCCURRENCE_AT, now)
                    .set(Tables.NOTIFICATIONS.NEXT_ATTEMPT_AT, now)
                    .set(Tables.NOTIFICATIONS.CREATED_AT, now)
                    .execute()).isInstanceOf(org.jooq.exception.DataAccessException.class);
            assertThat(dsl.fetchCount(Tables.NOTIFICATIONS, Tables.NOTIFICATIONS.DEDUPE_KEY.eq(key))).isEqualTo(1);
            dsl.execute("insert into shared.user_contacts (uid, email, updated_at) values ('contact-test', 'a@example.test', now()) "
                    + "on conflict (uid) do nothing");
        }
    }

    @Test
    void auditEventsAreAppendOnlyInTheDatabase() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = DSL.using(c, SQLDialect.POSTGRES);
            UUID id = UuidV7.next();
            dsl.insertInto(Tables.AUDIT_EVENTS)
                    .set(Tables.AUDIT_EVENTS.ID, id)
                    .set(Tables.AUDIT_EVENTS.ACTOR_UID, "u1")
                    .set(Tables.AUDIT_EVENTS.ACTION, "a")
                    .set(Tables.AUDIT_EVENTS.SUBJECT_TYPE, "t")
                    .set(Tables.AUDIT_EVENTS.DETAILS, JSONB.valueOf("{\"k\":1}"))
                    .set(Tables.AUDIT_EVENTS.CREATED_AT, OffsetDateTime.now())
                    .execute();

            assertThatThrownBy(() -> dsl.update(Tables.AUDIT_EVENTS).set(Tables.AUDIT_EVENTS.ACTION, "x")
                    .where(Tables.AUDIT_EVENTS.ID.eq(id)).execute()).hasMessageContaining("append-only");
            assertThatThrownBy(() -> dsl.deleteFrom(Tables.AUDIT_EVENTS).where(Tables.AUDIT_EVENTS.ID.eq(id)).execute())
                    .hasMessageContaining("append-only");
            assertThatThrownBy(() -> dsl.execute("truncate shared.audit_events")).hasMessageContaining("append-only");

            assertThat(dsl.selectFrom(Tables.AUDIT_EVENTS).where(Tables.AUDIT_EVENTS.ID.eq(id)).fetchSingle().getAction())
                    .isEqualTo("a");
        }
    }

    @Test
    void roleAndStatusChecksAreEnforced() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = DSL.using(c, SQLDialect.POSTGRES);
            UUID h = UuidV7.next();
            dsl.insertInto(Tables.HOUSEHOLDS).set(Tables.HOUSEHOLDS.ID, h).set(Tables.HOUSEHOLDS.NAME, "n")
                    .set(Tables.HOUSEHOLDS.CREATED_BY, "u").set(Tables.HOUSEHOLDS.CREATED_AT, OffsetDateTime.now()).execute();
            assertThatThrownBy(() -> dsl.insertInto(Tables.HOUSEHOLD_MEMBERS)
                    .set(Tables.HOUSEHOLD_MEMBERS.HOUSEHOLD_ID, h).set(Tables.HOUSEHOLD_MEMBERS.MEMBER_UID, "u")
                    .set(Tables.HOUSEHOLD_MEMBERS.ROLE, "SUPERUSER").set(Tables.HOUSEHOLD_MEMBERS.JOINED_AT, OffsetDateTime.now())
                    .execute()).isInstanceOf(org.jooq.exception.DataAccessException.class);
        }
    }
}
