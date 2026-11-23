package com.personalplatform.auth.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * Refuses to start when the management port equals the main port, or is set but blank (an empty MANAGEMENT_PORT makes
 * the management port resolve to the main port): actuator (Prometheus) would then be served on the public listener.
 * Ports are compared as integers ("08089" equals 8089); an unset main port is 8080. Port 0 (random, used by tests) stays valid, as does an unset management port.
 */
@Configuration(proxyBeanMethods = false)
class ManagementPortGuard {

    @Bean
    static Object managementPortCheck(Environment env) {
        check(env);
        return new Object();
    }

    static void check(Environment env) {
        String management = env.getProperty("management.server.port");
        if (management == null) {
            return;
        }
        if (management.isBlank()) {
            throw new IllegalStateException("MANAGEMENT_PORT is set but blank: the management port would fall back to the main server port, "
                    + "so metrics and health would be served on the public port. Unset it or set a private port.");
        }
        String mainValue = env.getProperty("server.port");
        int managementPort = parsePort("MANAGEMENT_PORT", management);
        int mainPort = mainValue == null || mainValue.isBlank() ? 8080 : parsePort("server.port", mainValue);
        if (managementPort != 0 && managementPort == mainPort) {
            throw new IllegalStateException("MANAGEMENT_PORT (" + managementPort + ") must differ from the main server port ("
                    + mainPort + "): metrics and health would be served on the public port. Set MANAGEMENT_PORT to a private port.");
        }
    }

    private static int parsePort(String name, String value) {
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            throw new IllegalStateException(name + " (" + value.trim() + ") is not a port number.", e);
        }
    }
}
