package com.personalplatform.waitingon.inbound;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param secret      shared secret the email provider sends in the {@code X-Webhook-Secret} header. Blank means the
 *                    webhook is disabled (every call is rejected), never "open".
 * @param replyDomain domain of the reply-to plus-addresses, i.e. {@code waiting+<token>@<replyDomain>}
 */
@ConfigurationProperties(prefix = "app.inbound")
public record InboundProperties(String secret, String replyDomain) {

    public InboundProperties {
        if (replyDomain == null || replyDomain.isBlank()) {
            replyDomain = "reply.waiting-on.local";
        }
    }
}
