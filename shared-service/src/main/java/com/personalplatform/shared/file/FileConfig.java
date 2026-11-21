package com.personalplatform.shared.file;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.Clock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(FileProperties.class)
public class FileConfig {

    private static final Logger LOG = LoggerFactory.getLogger(FileConfig.class);

    @Bean
    BlobStore blobStore(FileProperties props) {
        return new LocalFsBlobStore(Path.of(props.localRoot()));
    }

    @Bean
    DownloadTokenService downloadTokenService(FileProperties props, Clock clock) {
        byte[] secret;
        if (props.tokenSecret() == null || props.tokenSecret().isBlank()) {
            LOG.warn("app.files.token-secret (FILE_TOKEN_SECRET) is not set: using a random per-process key; "
                    + "download links will not survive a restart and will not work across instances");
            secret = new byte[32];
            new SecureRandom().nextBytes(secret);
        } else {
            secret = props.tokenSecret().getBytes(StandardCharsets.UTF_8);
        }
        return new DownloadTokenService(secret, clock, props.defaultTokenTtl(), props.maxTokenTtl());
    }
}
