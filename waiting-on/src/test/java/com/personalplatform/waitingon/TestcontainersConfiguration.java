package com.personalplatform.waitingon;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/** One Postgres for the whole test JVM, shared by every Spring context (cleaned up by Ryuk at exit). */
@TestConfiguration(proxyBeanMethods = false)
class TestcontainersConfiguration {

    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse("postgres:16"));

    static {
        POSTGRES.start();
    }

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgresContainer() {
        return POSTGRES;
    }
}
