package com.personalplatform.homepulse.ingest;

import com.personalplatform.homepulse.config.HomePulseProperties;
import com.personalplatform.homepulse.device.DeviceRepository;
import com.personalplatform.homepulse.reading.ReadingsRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IngestService {

    private final ReadingsRepository readings;
    private final DeviceRepository devices;
    private final HomePulseProperties props;
    private final Clock clock;

    public IngestService(ReadingsRepository readings, DeviceRepository devices, HomePulseProperties props, Clock clock) {
        this.readings = readings;
        this.devices = devices;
        this.props = props;
        this.clock = clock;
    }

    public int maxBatchSize() {
        return props.ingest().maxBatchSize();
    }

    /**
     * Stores the batch for an already-authenticated device. Idempotent: (device, ts) is the primary key and
     * conflicts are ignored, so a device that retries after a lost response can never double-count.
     */
    @Transactional
    public IngestResult ingest(UUID deviceId, List<ReadingInput> batch) {
        if (batch.size() > props.ingest().maxBatchSize()) {
            throw new IllegalArgumentException("batch too large (max " + props.ingest().maxBatchSize() + " readings)");
        }
        Instant now = clock.instant();
        Instant newest = now.plus(props.ingest().maxFutureSkew());
        Instant oldest = now.minus(props.ingest().maxAge());
        List<ReadingInput> usable = batch.stream()
                .filter(r -> !r.ts().isAfter(newest) && !r.ts().isBefore(oldest))
                .toList();
        int accepted = readings.insertIgnoringDuplicates(deviceId, usable);
        devices.touch(deviceId, now);
        return new IngestResult(batch.size(), accepted, usable.size() - accepted, batch.size() - usable.size());
    }
}
