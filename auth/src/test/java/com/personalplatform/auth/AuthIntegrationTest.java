package com.personalplatform.auth;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

/**
 * One configuration for every Spring test in this module, so they all share one application context and one
 * Postgres container. Tests isolate themselves with fresh random users (see {@link TestUsers}); the audit log is
 * append-only, so they never clean tables.
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, StubJwtConfig.class})
@TestPropertySource(
        properties = {
            "app.auth.bootstrap-admin-emails=boss@example.com",
            // base64 of 32 bytes: a TEST value only
            "app.platform.key-encryption-key=dGVzdC1vbmx5LWtleS1lbmNyeXB0aW9uLWtleS0zMmI=",
            "app.platform.issuer=http://auth.test"
        })
public @interface AuthIntegrationTest {}
