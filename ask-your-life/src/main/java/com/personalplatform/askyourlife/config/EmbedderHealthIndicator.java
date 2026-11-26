package com.personalplatform.askyourlife.config;

import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.stereotype.Component;

/**
 * {@code /actuator/health} component {@code embedder}: which embedder runs, and whether it is a fallback.
 * A fallback is still UP (search works, with lexical vectors only) but says so in its details.
 */
@Component // bean "embedderHealthIndicator" -> health component "embedder"
public class EmbedderHealthIndicator implements HealthIndicator {

    private final EmbedderSelection selection;

    public EmbedderHealthIndicator(EmbedderSelection selection) {
        this.selection = selection;
    }

    @Override
    public Health health() {
        Health.Builder b = Health.up()
                .withDetail("requested", selection.requested().name().toLowerCase(java.util.Locale.ROOT))
                .withDetail("active", selection.embedder().id())
                .withDetail("dimension", selection.embedder().dimension())
                .withDetail("fallback", selection.fallback());
        if (selection.fallback()) {
            b.withDetail("fallbackReason", selection.fallbackReason());
        }
        return b.build();
    }
}
