package com.personalplatform.askyourlife.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/** One pgvector Postgres for the whole test JVM (static singleton, shared across Spring contexts). */
@TestConfiguration(proxyBeanMethods = false)
public class PgVectorContainerConfig {

    public static final String IMAGE = "pgvector/pgvector:0.8.0-pg16";

    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(
            DockerImageName.parse(IMAGE).asCompatibleSubstituteFor("postgres"));

    static {
        POSTGRES.start();
    }

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgresContainer() {
        return POSTGRES;
    }

    public static PostgreSQLContainer container() {
        return POSTGRES;
    }
}
