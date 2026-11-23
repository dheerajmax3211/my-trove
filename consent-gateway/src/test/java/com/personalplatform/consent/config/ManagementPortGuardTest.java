package com.personalplatform.consent.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class ManagementPortGuardTest {

    @Test
    void refusesToStartWhenTheManagementPortIsTheMainPort() {
        MockEnvironment env = new MockEnvironment().withProperty("server.port", "8084").withProperty("management.server.port", "8084");
        assertThatThrownBy(() -> ManagementPortGuard.check(env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MANAGEMENT_PORT");
    }

    @Test
    void refusesToStartWhenTheManagementPortIsBlank() {
        MockEnvironment env = new MockEnvironment().withProperty("server.port", "8084").withProperty("management.server.port", "");
        assertThatThrownBy(() -> ManagementPortGuard.check(env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MANAGEMENT_PORT");
        MockEnvironment spaces = new MockEnvironment().withProperty("server.port", "8084").withProperty("management.server.port", "  ");
        assertThatThrownBy(() -> ManagementPortGuard.check(spaces)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void aSeparateOrRandomManagementPortIsFine() {
        assertThatCode(() -> ManagementPortGuard.check(new MockEnvironment()
                .withProperty("server.port", "8084").withProperty("management.server.port", "9084"))).doesNotThrowAnyException();
        assertThatCode(() -> ManagementPortGuard.check(new MockEnvironment()
                .withProperty("server.port", "8084").withProperty("management.server.port", "0"))).doesNotThrowAnyException();
        assertThatCode(() -> ManagementPortGuard.check(new MockEnvironment())).doesNotThrowAnyException();
    }

    @Test
    void comparesPortsAsIntegersAndDefaultsTheMainPort() {
        MockEnvironment leadingZero = new MockEnvironment().withProperty("server.port", "8089").withProperty("management.server.port", "08089");
        assertThatThrownBy(() -> ManagementPortGuard.check(leadingZero)).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MANAGEMENT_PORT");
        MockEnvironment padded = new MockEnvironment().withProperty("server.port", " 8089 ").withProperty("management.server.port", "8089");
        assertThatThrownBy(() -> ManagementPortGuard.check(padded)).isInstanceOf(IllegalStateException.class);
        // server.port unset: the main port defaults to 8080.
        MockEnvironment unsetMain = new MockEnvironment().withProperty("management.server.port", "8080");
        assertThatThrownBy(() -> ManagementPortGuard.check(unsetMain)).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MANAGEMENT_PORT");
        assertThatCode(() -> ManagementPortGuard.check(new MockEnvironment().withProperty("management.server.port", "9080")))
                .doesNotThrowAnyException();
    }
}
