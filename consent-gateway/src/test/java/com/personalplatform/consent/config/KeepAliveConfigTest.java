package com.personalplatform.consent.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.tomcat.autoconfigure.TomcatServerProperties;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.io.support.PropertiesLoaderUtils;

/**
 * The gateway pools connections to this service and never closes idle ones. If Tomcat closes an idle keep-alive
 * connection first, the gateway's next request on it fails with "Connection prematurely closed BEFORE response" and the
 * caller gets a 500. Tomcat's keep-alive timeout must therefore be set explicitly and be generous.
 */
class KeepAliveConfigTest {

    @Test
    void idleKeepAliveConnectionsOutliveTheGatewayReuseWindow() throws IOException {
        Properties props = PropertiesLoaderUtils.loadProperties(new ClassPathResource("application.properties"));
        Map<String, Object> source = new HashMap<>();
        props.forEach((k, v) -> source.put(k.toString(), v));

        TomcatServerProperties tomcat = new Binder(
                        ConfigurationPropertySources.from(new MapPropertySource("application", source)))
                .bind("server.tomcat", TomcatServerProperties.class)
                .orElseGet(TomcatServerProperties::new);

        assertThat(tomcat.getKeepAliveTimeout())
                .as("server.tomcat.keep-alive-timeout must be set explicitly")
                .isNotNull()
                .isGreaterThanOrEqualTo(Duration.ofMinutes(10));
    }
}
