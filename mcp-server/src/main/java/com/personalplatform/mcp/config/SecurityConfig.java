package com.personalplatform.mcp.config;

import com.personalplatform.security.PermissionAuthoritiesConverter;
import jakarta.servlet.DispatcherType;
import org.springframework.boot.security.autoconfigure.actuate.web.servlet.EndpointRequest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Platform tokens only (this service runs in {@code app.security.mode=platform}; the decoder comes from
 * platform-security). The MCP endpoint needs {@code mcp:use}, which the gateway also enforces; checking it here too
 * means a request that reaches the pod without the gateway is held to the same rule. Each tool then checks the
 * product permission it reads with. Everything else on the main port is denied.
 */
@Configuration(proxyBeanMethods = false)
public class SecurityConfig {

    public static final String MCP_PATH = "/mcp";
    public static final String MCP_USE = "mcp:use";

    @Bean
    SecurityFilterChain mcpFilterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/actuator/health/**", "/actuator/info").permitAll()
                        .requestMatchers(MCP_PATH).hasAuthority(MCP_USE)
                        // An error dispatch (e.g. the transport's 405 for GET) keeps its status instead of turning 403.
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .anyRequest().denyAll())
                .oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(
                        PermissionAuthoritiesConverter.jwtAuthenticationConverter())));
        return http.build();
    }

    /**
     * Actuator on the private management port (Prometheus scrape, health). {@link EndpointRequest} only matches in the
     * management context when the management port differs from the main one, so the main port never serves these.
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
