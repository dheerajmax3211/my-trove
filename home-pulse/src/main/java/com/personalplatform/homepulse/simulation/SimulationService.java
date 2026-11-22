package com.personalplatform.homepulse.simulation;

import com.personalplatform.homepulse.alert.AlertRepository;
import com.personalplatform.homepulse.appliance.Appliance;
import com.personalplatform.homepulse.appliance.ApplianceRepository;
import com.personalplatform.homepulse.config.HomePulseProperties;
import com.personalplatform.homepulse.device.Device;
import com.personalplatform.homepulse.device.DeviceRepository;
import com.personalplatform.homepulse.device.DeviceService;
import com.personalplatform.homepulse.eval.BaselineRepository;
import com.personalplatform.homepulse.eval.EvaluationService;
import com.personalplatform.homepulse.ingest.IngestResult;
import com.personalplatform.homepulse.ingest.IngestService;
import com.personalplatform.homepulse.ingest.ReadingInput;
import com.personalplatform.homepulse.reading.ReadingsRepository;
import com.personalplatform.homepulse.web.NotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Built-in simulator for users without hardware. It drives the real pipeline: a device flagged {@code simulated}
 * (created through {@link DeviceService}, so token generation and hashing are the normal ones) "posts" generated
 * readings through {@link IngestService}, then the anomaly evaluation runs once, immediately.
 *
 * <p>Starting a simulation replaces the previous simulated history of the appliance (same device, readings dropped,
 * baseline forgotten, simulated alerts closed), so repeating a call gives the same result and switching scenario
 * never leaves stale rows behind. Everything runs in one transaction.
 */
@Service
@Transactional
public class SimulationService {

    private static final Logger LOG = LoggerFactory.getLogger(SimulationService.class);

    public record Result(int readingsInserted, String baselineStatus, boolean alertOpened) {}

    private final ApplianceRepository appliances;
    private final DeviceService deviceService;
    private final DeviceRepository devices;
    private final IngestService ingest;
    private final ReadingsRepository readings;
    private final BaselineRepository baselines;
    private final AlertRepository alerts;
    private final EvaluationService evaluation;
    private final HomePulseProperties props;
    private final Clock clock;

    public SimulationService(ApplianceRepository appliances, DeviceService deviceService, DeviceRepository devices,
                             IngestService ingest, ReadingsRepository readings, BaselineRepository baselines,
                             AlertRepository alerts, EvaluationService evaluation, HomePulseProperties props, Clock clock) {
        this.appliances = appliances;
        this.deviceService = deviceService;
        this.devices = devices;
        this.ingest = ingest;
        this.readings = readings;
        this.baselines = baselines;
        this.alerts = alerts;
        this.evaluation = evaluation;
        this.props = props;
        this.clock = clock;
    }

    public Result start(String ownerUid, UUID applianceId, int days, SimulationScenario scenario) {
        Appliance appliance = appliances.find(ownerUid, applianceId).orElseThrow(() -> new NotFoundException("Appliance"));
        Device device = deviceService.ensureSimulated(ownerUid, applianceId);
        Instant now = clock.instant();

        clear(device, applianceId, now);

        List<ReadingInput> generated = SimulationGenerator.generate(appliance.type(), seed(applianceId), scenario, now, days);
        int inserted = 0;
        int batch = ingest.maxBatchSize();
        for (int i = 0; i < generated.size(); i += batch) {
            IngestResult r = ingest.ingest(device.id(), generated.subList(i, Math.min(generated.size(), i + batch)));
            inserted += r.accepted();
        }

        // learn "normal" from the healthy part of the history (the anomaly, if any, must not become the baseline)
        Instant first = generated.get(0).ts();
        Instant healthyEnd = scenario == SimulationScenario.ANOMALY
                ? now.minus(Duration.ofHours(SimulationGenerator.anomalyHours(appliance.type())))
                : now;
        evaluation.learnBaselineNow(applianceId, first, healthyEnd);
        evaluation.evaluate(applianceId);

        String baselineStatus = baselines.find(applianceId).map(b -> b.status().name()).orElse("NONE");
        boolean alertOpened = !alerts.liveForAppliance(applianceId).isEmpty();
        LOG.info("simulation for appliance {}: {} {} days, {} readings, baseline {}, alertOpened={}", applianceId,
                scenario, days, inserted, baselineStatus, alertOpened);
        return new Result(inserted, baselineStatus, alertOpened);
    }

    /** Removes the simulated device with its readings and baseline, and closes alerts that came from simulated data. */
    public void stop(String ownerUid, UUID applianceId) {
        appliances.find(ownerUid, applianceId).orElseThrow(() -> new NotFoundException("Appliance"));
        devices.findActiveForAppliance(applianceId).filter(Device::simulated).ifPresent(d -> {
            clear(d, applianceId, clock.instant());
            devices.deleteSimulated(ownerUid, d.id());
        });
    }

    private void clear(Device device, UUID applianceId, Instant now) {
        readings.deleteForDevice(device.id());
        baselines.delete(applianceId);
        alerts.resolveSimulated(applianceId, now);
    }

    /** Different appliances get different (but stable) histories. */
    private static long seed(UUID applianceId) {
        return applianceId.getMostSignificantBits() ^ Long.rotateLeft(applianceId.getLeastSignificantBits(), 21);
    }
}
