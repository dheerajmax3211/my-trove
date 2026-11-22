package com.personalplatform.platform.webhooks;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Webhook settings ({@code app.webhooks.*}). The domain topic carries events published by the product services (reminders,
 * approvals, consent); unreadable events go to its dead-letter topic. The worker can be switched off (tests do, and call
 * {@link WebhookDeliveryWorker#deliverDue()} themselves).
 */
@ConfigurationProperties("app.webhooks")
public record WebhookProperties(
        @DefaultValue("platform.domain.events.v1") String domainTopic,
        @DefaultValue("platform.domain.events.v1.dlq") String domainDlqTopic,
        @DefaultValue("true") boolean workerEnabled,
        @DefaultValue("PT2S") String workerInterval) {}
