package com.personalplatform.sql;

import org.jooq.ExecuteListenerProvider;
import org.jooq.impl.DefaultExecuteListenerProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.jooq.autoconfigure.JooqAutoConfiguration;
import org.springframework.context.annotation.Bean;

/** Applied automatically to any service that has platform-sql on its classpath. */
@AutoConfiguration(before = JooqAutoConfiguration.class)
@EnableConfigurationProperties(PlatformSqlProperties.class)
public class PlatformSqlAutoConfiguration {

    private static final Logger LOG = LoggerFactory.getLogger("platform.sql.slow");

    @Bean
    ExecuteListenerProvider slowQueryListenerProvider(PlatformSqlProperties props) {
        return new DefaultExecuteListenerProvider(new SlowQueryListener(props.slowQueryThreshold(), LOG::warn));
    }
}
