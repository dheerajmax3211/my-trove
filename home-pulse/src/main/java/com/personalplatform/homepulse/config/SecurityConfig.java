package com.personalplatform.homepulse.config;

import com.personalplatform.homepulse.device.DeviceService;
import java.nio.charset.StandardCharsets;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Two stateless chains:
 * <ol>
 *   <li><b>order 1, {@code /v1/ingest/**}</b>: devices authenticate with their own ingestion token (hash lookup),
 *       Firebase is not involved; a Firebase ID token is rejected here and a device token is rejected on the
 *       owner chain.</li>
 *   <li><b>order 2, everything else</b>: the platform default, Firebase ID tokens via the resource-server JWT
 *       decoder ({@code @AuthenticationPrincipal Jwt}), health endpoints public. Declared explicitly because
 *       the platform's auto-configured chain backs off as soon as a service declares any chain.</li>
 * </ol>
 */
@Configuration(proxyBeanMethods = false)
class SecurityConfig {

    @Bean
    @Order(1)
    SecurityFilterChain ingestChain(HttpSecurity http, DeviceService devices) throws Exception {
        http.securityMatcher("/v1/ingest/**")
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().hasRole("DEVICE"))
                .addFilterBefore(new DeviceTokenFilter(devices), UsernamePasswordAuthenticationFilter.class)
                .exceptionHandling(e -> e.authenticationEntryPoint(unauthorized()));
        return http.build();
    }

    @Bean
    @Order(2)
    SecurityFilterChain ownerChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/actuator/health/**", "/actuator/info").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(j -> {}));
        return http.build();
    }

    private static AuthenticationEntryPoint unauthorized() {
        return (request, response, ex) -> {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setHeader("WWW-Authenticate", "Bearer");
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write("{\"type\":\"about:blank\",\"title\":\"Unauthorized\",\"status\":401,"
                    + "\"detail\":\"Missing or invalid device token\"}");
        };
    }
}
