package com.personalplatform.auth.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(Auth auth) {

    public record Auth(List<String> bootstrapAdminEmails) {
        public Auth {
            bootstrapAdminEmails = bootstrapAdminEmails == null ? List.of() : List.copyOf(bootstrapAdminEmails);
        }
    }
}
