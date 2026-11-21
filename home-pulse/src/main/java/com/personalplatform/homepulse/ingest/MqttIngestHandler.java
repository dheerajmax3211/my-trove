package com.personalplatform.homepulse.ingest;

import com.personalplatform.homepulse.device.DeviceService;
import java.time.Clock;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Broker-agnostic handling of one MQTT message: map (pure) -> check the device is live -> store (idempotent).
 * Separated from the Paho client so it is testable without a broker.
 *
 * <p>Trust model: MQTT messages carry no per-message token. The broker is the authentication boundary (each device
 * connects with its own broker credentials and a topic ACL restricting it to {@code homepulse/<its id>/reading});
 * this handler only guarantees the device id in the topic belongs to a live, non-revoked device.
 */
@Component
public class MqttIngestHandler {

    private static final Logger LOG = LoggerFactory.getLogger(MqttIngestHandler.class);

    private final DeviceService devices;
    private final IngestService ingest;
    private final Clock clock;
    private final AtomicLong stored = new AtomicLong();
    private final AtomicLong dropped = new AtomicLong();

    public MqttIngestHandler(DeviceService devices, IngestService ingest, Clock clock) {
        this.devices = devices;
        this.ingest = ingest;
        this.clock = clock;
    }

    /** Never throws: a poison message must not kill the subscriber callback thread. */
    public void handle(String topic, byte[] payload) {
        try {
            var result = MqttReadingMapper.map(topic, payload, clock.instant());
            switch (result) {
                case MqttReadingMapper.Rejected r -> drop(topic, r.reason());
                case MqttReadingMapper.Mapped m -> {
                    if (devices.activeDevice(m.deviceId()).isEmpty()) {
                        drop(topic, "unknown or revoked device");
                        return;
                    }
                    IngestResult res = ingest.ingest(m.deviceId(), List.of(m.reading()));
                    if (res.accepted() == 1) {
                        stored.incrementAndGet();
                    } else if (res.rejected() == 1) {
                        drop(topic, "timestamp outside accepted window");
                    }
                }
            }
        } catch (RuntimeException e) {
            dropped.incrementAndGet();
            LOG.warn("MQTT message on {} failed: {}", topic, e.toString());
        }
    }

    private void drop(String topic, String reason) {
        dropped.incrementAndGet();
        LOG.debug("MQTT message on {} dropped: {}", topic, reason);
    }

    public long storedCount() {
        return stored.get();
    }

    public long droppedCount() {
        return dropped.get();
    }
}
