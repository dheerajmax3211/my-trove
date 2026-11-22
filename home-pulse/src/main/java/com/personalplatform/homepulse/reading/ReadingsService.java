package com.personalplatform.homepulse.reading;

import com.personalplatform.homepulse.appliance.ApplianceRepository;
import com.personalplatform.homepulse.device.Device;
import com.personalplatform.homepulse.device.DeviceRepository;
import com.personalplatform.homepulse.device.ReadingSource;
import com.personalplatform.homepulse.web.NotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class ReadingsService {

    /**
     * {@code source}: where the numbers come from, the live device's kind (null without a live device).
     * {@code simulated}: the live device is the built-in simulator.
     */
    public record Series(UUID applianceId, Instant from, Instant to, Resolution resolution, ReadingSource source,
                         boolean simulated, List<ReadingPoint> points) {}

    static final Duration MAX_RANGE = Duration.ofDays(400);

    private final ApplianceRepository appliances;
    private final DeviceRepository devices;
    private final ReadingsRepository readings;
    private final Clock clock;

    public ReadingsService(ApplianceRepository appliances, DeviceRepository devices, ReadingsRepository readings, Clock clock) {
        this.appliances = appliances;
        this.devices = devices;
        this.readings = readings;
        this.clock = clock;
    }

    /**
     * @param from       inclusive; defaults to 24 h before {@code to}
     * @param to         exclusive; defaults to now
     * @param resolution optional override; by default chosen from the range ({@link Resolution#choose})
     */
    public Series query(String ownerUid, UUID applianceId, Instant from, Instant to, Resolution resolution) {
        appliances.find(ownerUid, applianceId).orElseThrow(() -> new NotFoundException("Appliance"));
        Instant end = to != null ? to : clock.instant();
        Instant start = from != null ? from : end.minus(Duration.ofHours(24));
        if (!start.isBefore(end)) {
            throw new IllegalArgumentException("from must be before to");
        }
        Duration range = Duration.between(start, end);
        if (range.compareTo(MAX_RANGE) > 0) {
            throw new IllegalArgumentException("range too large (max 400 days)");
        }
        Resolution chosen = resolution != null ? resolution : Resolution.choose(range);
        if (chosen.pointsFor(range) > Resolution.MAX_POINTS) {
            throw new IllegalArgumentException("range would return more than " + Resolution.MAX_POINTS
                    + " points at resolution " + chosen + "; use a coarser resolution or a shorter range");
        }
        // Never mix sources. A running simulation answers with its own readings only; otherwise the answer is the
        // real and manual history of the appliance (a replaced plug keeps its history). Simulated readings are
        // deleted when the simulation stops, so they are never left behind to leak into a real chart.
        Optional<Device> live = devices.findActiveForAppliance(applianceId);
        boolean simulatedRun = live.map(Device::simulated).orElse(false);
        List<Device> all = devices.listForAppliance(ownerUid, applianceId);
        List<UUID> deviceIds = all.stream()
                .filter(d -> simulatedRun ? d.simulated() && d.active() : !d.simulated())
                .map(Device::id).toList();
        return new Series(applianceId, start, end, chosen, live.map(Device::source).orElse(null), simulatedRun,
                readings.series(deviceIds, start, end, chosen));
    }
}
