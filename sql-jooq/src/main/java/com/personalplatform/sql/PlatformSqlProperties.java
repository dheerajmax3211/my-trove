package com.personalplatform.sql;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "platform.sql")
public record PlatformSqlProperties(Duration slowQueryThreshold) {

    public PlatformSqlProperties {
        slowQueryThreshold = slowQueryThreshold == null ? Duration.ofMillis(200) : slowQueryThreshold;
    }
}
