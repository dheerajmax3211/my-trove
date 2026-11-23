package com.personalplatform.security;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.security.autoconfigure.actuate.web.servlet.EndpointRequest;
import org.springframework.context.annotation.Bean;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Lets the Prometheus scrape (and health) through on the private management port for services that use the default
 * platform chain. Only active when {@code platformFilterChain} is, so a service that declares its own chain keeps full
 * control (and declares its own actuator chain). {@link EndpointRequest} only matches in the management context when
 * the management port differs from the main one, so the main port never serves these paths and the default chain still
 * answers 401 for them. The management port must stay private.
 */
@AutoConfiguration(after = PlatformSecurityAutoConfiguration.class)
@ConditionalOnClass(EndpointRequest.class)
@ConditionalOnBean(name = "platformFilterChain")
public class ActuatorSecurityAutoConfiguration {

    @Bean
    @Order(0)
    SecurityFilterChain actuatorChain(HttpSecurity http) throws Exception {
        http.securityMatcher(EndpointRequest.toAnyEndpoint())
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        return http.build();
    }
}
