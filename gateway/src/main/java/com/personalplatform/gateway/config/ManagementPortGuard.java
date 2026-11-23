package com.personalplatform.gateway.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * Refuses to start when the management port equals the main port: actuator (Prometheus) would then be served on the
 * public listener. Port 0 (random, used by tests) is never equal to a real main port and stays valid.
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
        String main = env.getProperty("server.port");
        if (management != null && !management.isBlank() && !"0".equals(management.trim())
                && management.trim().equals(main == null ? null : main.trim())) {
            throw new IllegalStateException("MANAGEMENT_PORT (" + management.trim() + ") must differ from the main server port ("
                    + main.trim() + "): metrics and health would be served on the public port. Set MANAGEMENT_PORT to a private port.");
        }
    }
}
