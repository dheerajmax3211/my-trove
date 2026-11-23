package com.personalplatform.platform.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class ManagementPortGuardTest {

    @Test
    void refusesToStartWhenTheManagementPortIsTheMainPort() {
        MockEnvironment env = new MockEnvironment().withProperty("server.port", "8089").withProperty("management.server.port", "8089");
        assertThatThrownBy(() -> ManagementPortGuard.check(env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MANAGEMENT_PORT");
    }

    @Test
    void refusesToStartWhenTheManagementPortIsBlank() {
        MockEnvironment env = new MockEnvironment().withProperty("server.port", "8089").withProperty("management.server.port", "");
        assertThatThrownBy(() -> ManagementPortGuard.check(env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MANAGEMENT_PORT");
        MockEnvironment spaces = new MockEnvironment().withProperty("server.port", "8089").withProperty("management.server.port", "  ");
        assertThatThrownBy(() -> ManagementPortGuard.check(spaces)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void aSeparateOrRandomManagementPortIsFine() {
        assertThatCode(() -> ManagementPortGuard.check(new MockEnvironment()
                .withProperty("server.port", "8089").withProperty("management.server.port", "9089"))).doesNotThrowAnyException();
        assertThatCode(() -> ManagementPortGuard.check(new MockEnvironment()
                .withProperty("server.port", "8089").withProperty("management.server.port", "0"))).doesNotThrowAnyException();
        assertThatCode(() -> ManagementPortGuard.check(new MockEnvironment())).doesNotThrowAnyException();
    }
}
