package com.personalplatform.sql;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** An existing database (schema at V1 with USER / ADMIN grants) upgrades to the persona model without losing anyone. */
@Testcontainers
class AuthRbacUpgradeTest {

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16");

    private static Flyway flyway(String target) {
        return Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .schemas("auth")
                .defaultSchema("auth")
                .locations("classpath:db/migration/auth", "classpath:db/migration/auth_ext")
                .target(target)
                .load();
    }

    @Test
    void legacyUserGrantsBecomeMemberAndUserRoleIsRemoved() throws Exception {
        flyway("1").migrate();
        try (Connection c = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
                Statement st = c.createStatement()) {
            st.execute("insert into auth.users (id, firebase_uid) values "
                    + "('00000000-0000-0000-0000-000000000001', 'legacy-user'),"
                    + "('00000000-0000-0000-0000-000000000002', 'legacy-admin')");
            st.execute("insert into auth.user_roles (user_id, role_name) values "
                    + "('00000000-0000-0000-0000-000000000001', 'USER'),"
                    + "('00000000-0000-0000-0000-000000000002', 'USER'),"
                    + "('00000000-0000-0000-0000-000000000002', 'ADMIN')");

            flyway("latest").migrate();

            List<String> grants = new ArrayList<>();
            try (ResultSet rs = st.executeQuery(
                    "select user_id::text || ':' || role_name from auth.user_roles order by 1")) {
                while (rs.next()) {
                    grants.add(rs.getString(1));
                }
            }
            assertThat(grants).containsExactly(
                    "00000000-0000-0000-0000-000000000001:MEMBER",
                    "00000000-0000-0000-0000-000000000002:ADMIN",
                    "00000000-0000-0000-0000-000000000002:MEMBER");
            try (ResultSet rs = st.executeQuery("select count(*) from auth.roles where name = 'USER'")) {
                rs.next();
                assertThat(rs.getInt(1)).isZero();
            }
            try (ResultSet rs = st.executeQuery(
                    "select plan, permissions_version, suspended_at is null from auth.users limit 1")) {
                rs.next();
                assertThat(rs.getString(1)).isEqualTo("FREE");
                assertThat(rs.getInt(2)).isEqualTo(1);
                assertThat(rs.getBoolean(3)).isTrue();
            }
        }
    }
}
