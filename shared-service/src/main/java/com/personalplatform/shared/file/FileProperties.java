package com.personalplatform.shared.file;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "app.files")
public record FileProperties(
        @DefaultValue("./data/blobs") String localRoot,
        /** HMAC key for download tokens (>= 32 chars). Blank = random per process (tokens die on restart). */
        @DefaultValue("") String tokenSecret,
        @DefaultValue("PT10M") Duration defaultTokenTtl,
        @DefaultValue("PT1H") Duration maxTokenTtl) {}
