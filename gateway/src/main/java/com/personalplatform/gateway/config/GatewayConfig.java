package com.personalplatform.gateway.config;

import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(GatewayProperties.class)
public class GatewayConfig {

    /** Picked up by Spring Cloud Gateway's observation filter in place of the default, which tags the query string. */
    @Bean
    PathOnlyGatewayObservationConvention gatewayObservationConvention() {
        return new PathOnlyGatewayObservationConvention();
    }

    @Bean
    Clock gatewayClock() {
        return Clock.systemUTC();
    }

    /**
     * One route per service: {@code /api/<name>/**} with the {@code /api/<name>} prefix stripped, to the base URI in
     * {@code gateway.services.<name>.uri}. The route id is the service name; filters key off it.
     */
    @Bean
    RouteLocator serviceRoutes(RouteLocatorBuilder builder, GatewayProperties props) {
        RouteLocatorBuilder.Builder routes = builder.routes();
        props.services().forEach((name, service) -> routes.route(name, r -> r
                .path("/api/" + name + "/**")
                .filters(f -> f
                        .stripPrefix(2)
                        // CORS is the gateway's job; keep exactly one value if a service adds its own.
                        .dedupeResponseHeader("Access-Control-Allow-Origin Access-Control-Allow-Credentials",
                                "RETAIN_FIRST"))
                .uri(service.uri())));
        return routes.build();
    }
}
