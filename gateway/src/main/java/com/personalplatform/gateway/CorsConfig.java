package com.personalplatform.gateway;

import com.personalplatform.gateway.config.GatewayProperties;
import java.time.Duration;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsWebFilter;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

/**
 * CORS is decided here, once, for every route. Services behind the gateway do not need their own CORS setup, and
 * any CORS header a service adds anyway is collapsed to the gateway's (see the route filters). Preflight requests
 * are answered without a credential, an exchange or a downstream call.
 */
@Configuration(proxyBeanMethods = false)
public class CorsConfig {

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    CorsWebFilter corsWebFilter(GatewayProperties props) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(props.cors().allowedOrigins());
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("*"));
        cors.setExposedHeaders(List.of("X-Request-Id", "Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining"));
        cors.setAllowCredentials(false);
        cors.setMaxAge(Duration.ofHours(1));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);
        return new CorsWebFilter(source);
    }
}
