package com.personalplatform.sql;

import static com.personalplatform.sql.jooq.waiting_on.waiting_on.Tables.ITEMS;
import static com.personalplatform.sql.jooq.waiting_on.waiting_on.Tables.ITEM_EVENTS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.sql.jooq.waiting_on.waiting_on.WaitingOn;
import java.sql.Connection;
import java.time.LocalDate;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.jooq.DSLContext;
import org.jooq.SQLDialect;
import org.jooq.Table;
import org.jooq.exception.DataAccessException;
import org.jooq.impl.DSL;
import org.jooq.impl.DefaultConfiguration;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Runs the real waiting_on migrations (tables + the plpgsql "_ext" location) on real Postgres, checks the generated
 * jOOQ classes against the result and proves the timeline is append-only at the database level.
 */
@Testcontainers
class WaitingOnSchemaTest {

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
                .schemas("waiting_on")
                .defaultSchema("waiting_on")
                .locations("classpath:db/migration/waiting_on", "classpath:db/migration/waiting_on_ext")
                .load()
                .migrate();
    }

    private DSLContext dsl(Connection c) {
        return DSL.using(new DefaultConfiguration().set(c).set(SQLDialect.POSTGRES));
    }

    private UUID insertItem(DSLContext dsl) {
        UUID id = UuidV7.next();
        dsl.insertInto(ITEMS)
                .set(ITEMS.ID, id)
                .set(ITEMS.OWNER_UID, "uid-1")
                .set(ITEMS.TITLE, "Refund for headphones")
                .set(ITEMS.COUNTERPARTY, "Shop Ltd")
                .set(ITEMS.CATEGORY, "REFUND")
                .set(ITEMS.EXPECTED_BY, LocalDate.of(2026, 3, 1))
                .set(ITEMS.STATUS, "OPEN")
                .set(ITEMS.REPLY_TOKEN, id.toString().replace("-", "").substring(0, 20))
                .set(ITEMS.WORKFLOW_ID, "follow-up-" + id)
                .set(ITEMS.NUDGE_AFTER_DAYS, 3)
                .set(ITEMS.ESCALATE_AFTER_DAYS, 10)
                .set(ITEMS.FINAL_NOTICE_AFTER_DAYS, 0)
                .set(ITEMS.EXPIRE_AFTER_DAYS, 45)
                .execute();
        return id;
    }

    private void insertEvent(DSLContext dsl, UUID itemId, String dedupeKey) {
        dsl.insertInto(ITEM_EVENTS)
                .set(ITEM_EVENTS.ID, UuidV7.next())
                .set(ITEM_EVENTS.ITEM_ID, itemId)
                .set(ITEM_EVENTS.OWNER_UID, "uid-1")
                .set(ITEM_EVENTS.TYPE, "CREATED")
                .set(ITEM_EVENTS.SUMMARY, "created")
                .set(ITEM_EVENTS.DEDUPE_KEY, dedupeKey)
                .execute();
    }

    @Test
    void everyGeneratedTableMatchesTheDatabase() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            assertThat(WaitingOn.WAITING_ON.getTables()).hasSize(2);
            for (Table<?> table : WaitingOn.WAITING_ON.getTables()) {
                dsl.selectFrom(table).limit(0).fetch(); // fails if a generated column is missing/misnamed
            }
        }
    }

    @Test
    void timelineRejectsUpdateDeleteAndTruncate() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            UUID item = insertItem(dsl);
            insertEvent(dsl, item, null);

            assertThatThrownBy(() -> dsl.update(ITEM_EVENTS).set(ITEM_EVENTS.SUMMARY, "tampered").execute())
                    .isInstanceOf(DataAccessException.class).hasMessageContaining("append-only");
            assertThatThrownBy(() -> dsl.deleteFrom(ITEM_EVENTS).execute())
                    .isInstanceOf(DataAccessException.class).hasMessageContaining("append-only");
            assertThatThrownBy(() -> dsl.execute("truncate table waiting_on.item_events"))
                    .isInstanceOf(DataAccessException.class).hasMessageContaining("append-only");

            assertThat(dsl.fetchCount(ITEM_EVENTS, ITEM_EVENTS.ITEM_ID.eq(item))).isEqualTo(1);
            assertThat(dsl.select(ITEM_EVENTS.SUMMARY).from(ITEM_EVENTS).where(ITEM_EVENTS.ITEM_ID.eq(item))
                    .fetchOne(ITEM_EVENTS.SUMMARY)).isEqualTo("created");
        }
    }

    @Test
    void appendIsStillAllowed() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            UUID item = insertItem(dsl);
            insertEvent(dsl, item, null);
            insertEvent(dsl, item, null);
            assertThat(dsl.fetchCount(ITEM_EVENTS, ITEM_EVENTS.ITEM_ID.eq(item))).isEqualTo(2);
        }
    }

    @Test
    void dedupeKeyMakesRetriesIdempotent() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            UUID item = insertItem(dsl);
            insertEvent(dsl, item, "nudge");
            assertThatThrownBy(() -> insertEvent(dsl, item, "nudge")).isInstanceOf(DataAccessException.class);
        }
    }

    @Test
    void eventsCannotPointAtMissingItemsAndChecksHold() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            DSLContext dsl = dsl(c);
            assertThatThrownBy(() -> insertEvent(dsl, UUID.randomUUID(), null)).isInstanceOf(DataAccessException.class);
            UUID item = insertItem(dsl);
            assertThatThrownBy(() -> dsl.update(ITEMS).set(ITEMS.STATUS, "BOGUS").where(ITEMS.ID.eq(item)).execute())
                    .isInstanceOf(DataAccessException.class);
        }
    }
}
