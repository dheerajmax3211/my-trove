package com.personalplatform.platform.config;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Two stateless chains, both answering errors with RFC 9457 problem bodies:
 * <ol>
 *   <li><b>order 1, {@code /internal/**}</b>: service-to-service, shared secret in {@code X-Internal-Key}
 *       ({@code app.internal.api-key}); no JWT is looked at, wrong or missing key is 401.</li>
 *   <li><b>order 2, everything else</b>: the platform JWT (decoder supplied by platform-security, mode by
 *       {@code app.security.mode}), health public, everything else authenticated; endpoints narrow it with
 *       {@code @PreAuthorize("hasAuthority('...')")}.</li>
 * </ol>
 * Declared explicitly because platform-security's default chain backs off as soon as a service declares any chain.
 */
@Configuration(proxyBeanMethods = false)
@EnableMethodSecurity
class SecurityConfig {

    @Bean
    @Order(1)
    SecurityFilterChain internalChain(HttpSecurity http, @Value("${app.internal.api-key:}") String internalKey) throws Exception {
        http.securityMatcher("/internal/**")
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().hasRole("INTERNAL"))
                .addFilterBefore(new InternalApiKeyFilter(internalKey), UsernamePasswordAuthenticationFilter.class)
                .exceptionHandling(e -> e.authenticationEntryPoint(unauthorized("Missing or invalid internal key"))
                        .accessDeniedHandler(forbidden()));
        return http.build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain apiChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/actuator/health/**", "/actuator/info").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(j -> {})
                        .authenticationEntryPoint(unauthorized("Missing or invalid access token"))
                        .accessDeniedHandler(forbidden()))
                .exceptionHandling(e -> e.authenticationEntryPoint(unauthorized("Missing or invalid access token"))
                        .accessDeniedHandler(forbidden()));
        return http.build();
    }

    private static AuthenticationEntryPoint unauthorized(String detail) {
        return (request, response, ex) -> {
            response.setHeader("WWW-Authenticate", "Bearer");
            problem(response, HttpStatus.UNAUTHORIZED, detail);
        };
    }

    private static AccessDeniedHandler forbidden() {
        return (request, response, ex) -> problem(response, HttpStatus.FORBIDDEN, "You do not have permission to perform this action");
    }

    private static void problem(HttpServletResponse response, HttpStatus status, String detail) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"type\":\"about:blank\",\"title\":\"" + status.getReasonPhrase() + "\",\"status\":"
                + status.value() + ",\"detail\":\"" + detail + "\"}");
    }
}
