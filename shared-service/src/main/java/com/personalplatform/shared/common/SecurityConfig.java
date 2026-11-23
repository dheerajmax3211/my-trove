package com.personalplatform.shared.common;

import org.springframework.boot.security.autoconfigure.actuate.web.servlet.EndpointRequest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Same stateless Firebase-JWT chain as platform-security, plus ONE public path: the signed file download.
 * That path is a capability URL (HMAC-signed, expiring token) so it can be used by an {@code <img>} tag or a
 * share link without a bearer header; every other endpoint requires a verified Firebase token.
 */
@Configuration
public class SecurityConfig {

    public static final String PUBLIC_DOWNLOAD_PATH = "/v1/files/download";

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/actuator/health/**", "/actuator/info").permitAll()
                        .requestMatchers(HttpMethod.GET, PUBLIC_DOWNLOAD_PATH).permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(j -> {}));
        return http.build();
    }

    /**
     * Actuator endpoints for the private management port (Prometheus scrape, health). {@link EndpointRequest} only
     * matches in the management context when the management port differs from the main one, so the main port never
     * serves these paths and its own chains still answer 401 for them. The management port must stay private.
     */
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
