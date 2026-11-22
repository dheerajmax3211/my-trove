package com.personalplatform.platform.webhooks;

import java.util.List;
import java.util.Set;

/** The domain events an endpoint can subscribe to. Producers of these events publish them to the domain topic. */
public final class WebhookEvents {

    public record Event(String name, String description) {}

    public static final List<Event> CATALOGUE = List.of(
            new Event("reminder.created", "A reminder was created in a household or product"),
            new Event("approval.decided", "An approval request was approved or declined"),
            new Event("consent.granted", "A user granted a connected app access to their data"),
            new Event("consent.revoked", "A user revoked a connected app's access"));

    public static final Set<String> TYPES = CATALOGUE.stream().map(Event::name).collect(java.util.stream.Collectors.toUnmodifiableSet());

    private WebhookEvents() {}
}
