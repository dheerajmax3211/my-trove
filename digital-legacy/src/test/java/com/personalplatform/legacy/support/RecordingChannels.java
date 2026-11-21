package com.personalplatform.legacy.support;

import com.personalplatform.legacy.notify.NotificationChannel;
import com.personalplatform.legacy.notify.NotificationMessage;
import com.personalplatform.legacy.protocol.ChannelType;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/** Shared log of every delivery attempt, plus switches to make channel types fail (to test fallbacks). */
public class RecordingChannels {

    public record Sent(UUID vaultId, ChannelType channel, String address, NotificationMessage message) {}

    private final List<Sent> sent = new CopyOnWriteArrayList<>();
    private final List<ChannelType> attempts = new CopyOnWriteArrayList<>();
    private final Set<ChannelType> failing = ConcurrentHashMap.newKeySet();

    public List<Sent> sentFor(UUID vaultId) {
        return sent.stream().filter(s -> s.vaultId().equals(vaultId)).toList();
    }

    public List<ChannelType> attempts() {
        return attempts;
    }

    public void failChannel(ChannelType t) {
        failing.add(t);
    }

    public void healAll() {
        failing.clear();
    }

    public NotificationChannel channel(ChannelType type) {
        return new NotificationChannel() {
            @Override
            public ChannelType type() {
                return type;
            }

            @Override
            public DeliveryResult send(NotificationMessage message, String address) {
                attempts.add(type);
                if (failing.contains(type)) {
                    return DeliveryResult.failed("simulated outage");
                }
                sent.add(new Sent(message.vaultId(), type, address, message));
                return DeliveryResult.ok();
            }
        };
    }
}
