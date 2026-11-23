package com.personalplatform.gateway.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class ManagementPortGuardTest {

    @Test
    void refusesToStartWhenTheManagementPortIsTheMainPort() {
        MockEnvironment env = new MockEnvironment().withProperty("server.port", "8080").withProperty("management.server.port", "8080");
        assertThatThrownBy(() -> ManagementPortGuard.check(env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MANAGEMENT_PORT");
    }

    @Test
    void aSeparateOrRandomManagementPortIsFine() {
        assertThatCode(() -> ManagementPortGuard.check(new MockEnvironment()
                .withProperty("server.port", "8080").withProperty("management.server.port", "9080"))).doesNotThrowAnyException();
        assertThatCode(() -> ManagementPortGuard.check(new MockEnvironment()
                .withProperty("server.port", "8080").withProperty("management.server.port", "0"))).doesNotThrowAnyException();
        assertThatCode(() -> ManagementPortGuard.check(new MockEnvironment())).doesNotThrowAnyException();
    }
}
