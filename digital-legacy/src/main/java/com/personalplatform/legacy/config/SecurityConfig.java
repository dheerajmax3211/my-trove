package com.personalplatform.legacy.config;

import com.personalplatform.legacy.trustee.TrusteePortalService;
import com.personalplatform.legacy.trustee.TrusteeTokenFilter;
import org.springframework.boot.security.autoconfigure.actuate.web.servlet.EndpointRequest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.access.intercept.AuthorizationFilter;

/**
 * Two filter chains. Trustees are not necessarily platform users, so they get their own chain that understands only
 * trustee tokens and can reach only {@code /v1/legacy/trustee/**}. Everything else uses the platform's Firebase
 * resource-server chain (re-declared here because platform-security backs off when a service declares any chain).
 */
@Configuration
public class SecurityConfig {

    static final String TRUSTEE_PATH = "/v1/legacy/trustee/**";

    @Bean
    @Order(1)
    SecurityFilterChain trusteeChain(HttpSecurity http, TrusteePortalService portal) throws Exception {
        http.securityMatcher(TRUSTEE_PATH)
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.POST, "/v1/legacy/trustee/accept").permitAll()
                        .anyRequest().hasRole("TRUSTEE"))
                .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .addFilterBefore(new TrusteeTokenFilter(portal), AuthorizationFilter.class);
        return http.build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain firebaseChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/actuator/health/**", "/actuator/info").permitAll()
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
