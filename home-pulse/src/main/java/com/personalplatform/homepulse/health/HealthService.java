package com.personalplatform.homepulse.health;

import com.personalplatform.homepulse.alert.Alert;
import com.personalplatform.homepulse.alert.AlertRepository;
import com.personalplatform.homepulse.alert.AlertResponse;
import com.personalplatform.homepulse.appliance.Appliance;
import com.personalplatform.homepulse.appliance.ApplianceRepository;
import com.personalplatform.homepulse.detect.Baseline;
import com.personalplatform.homepulse.detect.MinuteSample;
import com.personalplatform.homepulse.detect.Severity;
import com.personalplatform.homepulse.device.Device;
import com.personalplatform.homepulse.device.DeviceRepository;
import com.personalplatform.homepulse.eval.BaselineRepository;
import com.personalplatform.homepulse.health.ApplianceHealth.Last24h;
import com.personalplatform.homepulse.health.ApplianceHealth.Status;
import com.personalplatform.homepulse.reading.ReadingsRepository;
import com.personalplatform.homepulse.web.NotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class HealthService {

    private final ApplianceRepository appliances;
    private final DeviceRepository devices;
    private final ReadingsRepository readings;
    private final BaselineRepository baselines;
    private final AlertRepository alerts;
    private final Clock clock;

    public HealthService(ApplianceRepository appliances, DeviceRepository devices, ReadingsRepository readings,
                         BaselineRepository baselines, AlertRepository alerts, Clock clock) {
        this.appliances = appliances;
        this.devices = devices;
        this.readings = readings;
        this.baselines = baselines;
        this.alerts = alerts;
        this.clock = clock;
    }

    public ApplianceHealth health(String ownerUid, UUID applianceId) {
        Appliance appliance = appliances.find(ownerUid, applianceId).orElseThrow(() -> new NotFoundException("Appliance"));
        Instant now = clock.instant();
        LocalDate today = LocalDate.now(clock.withZone(ZoneOffset.UTC));
        List<Alert> live = alerts.list(ownerUid, null, applianceId, true, 100);
        List<AlertResponse> liveViews = live.stream().map(a -> AlertResponse.from(a, today)).toList();

        Optional<Device> device = devices.findActiveForAppliance(applianceId);
        var baselineRow = baselines.find(applianceId);
        Baseline baseline = baselineRow.map(BaselineRepository.Row::stats).orElse(null);
        Instant lastReading = device.flatMap(d -> readings.lastReading(d.id())).orElse(null);
        Last24h last24h = device.map(d -> last24h(d.id(), baseline, now)).orElse(null);

        Status status;
        if (live.stream().anyMatch(a -> a.severity() == Severity.CRITICAL)) {
            status = Status.CRITICAL;
        } else if (!live.isEmpty()) {
            status = Status.WARNING;
        } else if (device.isEmpty()) {
            status = Status.NO_DEVICE;
        } else if (baseline == null) {
            status = Status.LEARNING;
        } else {
            status = Status.HEALTHY;
        }
        boolean warranty = appliance.warrantyEndDate() != null && !appliance.warrantyEndDate().isBefore(today);
        var service = new ApplianceHealth.Service(warranty, appliance.warrantyEndDate(),
                appliance.warrantyEndDate() == null ? null : ChronoUnit.DAYS.between(today, appliance.warrantyEndDate()),
                appliance.lastServiceDate(), appliance.nextServiceDate(),
                appliance.nextServiceDate() != null && appliance.nextServiceDate().isBefore(today));
        return new ApplianceHealth(applianceId, appliance.name(), status,
                baselineRow.map(r -> r.status().name()).orElse("NONE"),
                baselineRow.map(BaselineRepository.Row::learnedAt).orElse(null), baseline, lastReading, last24h,
                liveViews, service);
    }

    private Last24h last24h(UUID deviceId, Baseline baseline, Instant now) {
        List<MinuteSample> samples = readings.minuteSamples(deviceId, now.minus(Duration.ofHours(24)), now);
        if (samples.isEmpty()) {
            return new Last24h(0, 0, 0, null, 0);
        }
        double sum = 0;
        double max = 0;
        long on = 0;
        for (MinuteSample s : samples) {
            sum += s.watts();
            max = Math.max(max, s.watts());
            if (baseline != null && baseline.switching() && s.watts() >= baseline.onThresholdWatts()) {
                on++;
            }
        }
        double avg = sum / samples.size();
        double kwh = sum / 60.0 / 1000.0;   // each sample is the mean power of one minute
        Double duty = baseline != null && baseline.switching() ? 100.0 * on / samples.size() : null;
        return new Last24h(round(avg), round(max), Math.round(kwh * 1000) / 1000.0, duty == null ? null : round(duty),
                samples.size());
    }

    private static double round(double v) {
        return Math.round(v * 10.0) / 10.0;
    }
}
