package com.personalplatform.homepulse.eval;

import com.personalplatform.homepulse.alert.AlertRepository;
import com.personalplatform.homepulse.appliance.Appliance;
import com.personalplatform.homepulse.appliance.ApplianceRepository;
import com.personalplatform.homepulse.config.HomePulseProperties;
import com.personalplatform.homepulse.detect.AlertKind;
import com.personalplatform.homepulse.detect.AlertReconciler;
import com.personalplatform.homepulse.detect.AnomalyModel;
import com.personalplatform.homepulse.detect.Baseline;
import com.personalplatform.homepulse.detect.BaselineLearner;
import com.personalplatform.homepulse.detect.DetectorProfile;
import com.personalplatform.homepulse.detect.MinuteSample;
import com.personalplatform.homepulse.device.Device;
import com.personalplatform.homepulse.device.DeviceRepository;
import com.personalplatform.homepulse.reading.ReadingsRepository;
import com.personalplatform.homepulse.web.NotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Evaluates one appliance: learns/loads its baseline, runs the pure detector on the 1-minute aggregate and applies
 * the reconciler's plan to the alert table. One transaction per appliance so a failure never affects the others.
 */
@Service
public class EvaluationService {

    private static final Logger LOG = LoggerFactory.getLogger(EvaluationService.class);

    private final ApplianceRepository appliances;
    private final DeviceRepository devices;
    private final ReadingsRepository readings;
    private final BaselineRepository baselines;
    private final AlertRepository alerts;
    private final HomePulseProperties props;
    private final Clock clock;
    private final AnomalyModel model;

    public EvaluationService(ApplianceRepository appliances, DeviceRepository devices, ReadingsRepository readings,
                             BaselineRepository baselines, AlertRepository alerts, HomePulseProperties props, Clock clock,
                             AnomalyModel model) {
        this.model = model;
        this.appliances = appliances;
        this.devices = devices;
        this.readings = readings;
        this.baselines = baselines;
        this.alerts = alerts;
        this.props = props;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<UUID> applianceIdsToEvaluate() {
        return appliances.listWithActiveDevice().stream().map(Appliance::id).toList();
    }

    @Transactional
    public AlertReconciler.Plan evaluate(UUID applianceId) {
        Appliance appliance = appliances.findInternal(applianceId).orElseThrow(() -> new NotFoundException("Appliance"));
        Optional<Device> device = devices.findActiveForAppliance(applianceId);
        if (device.isEmpty()) {
            return new AlertReconciler.Plan(List.of(), List.of(), List.of(), List.of());
        }
        Instant now = clock.instant();
        DetectorProfile profile = DetectorProfile.forType(appliance.type());
        Baseline baseline = currentBaseline(appliance, device.get(), profile, now);

        Instant lastSeen = readings.lastReading(device.get().id()).orElse(device.get().createdAt());
        Instant lookbackFrom = now.minus(Duration.ofMinutes(DetectorProfile.FETCH_LOOKBACK_MINUTES));
        List<MinuteSample> samples = readings.minuteSamples(device.get(), lookbackFrom, now);

        var live = alerts.liveForAppliance(applianceId);
        Set<AlertKind> liveKinds = live.stream().map(AlertReconciler.LiveAlert::kind).collect(Collectors.toSet());
        Device dev = device.get();
        var evaluation = model.evaluate(new AnomalyModel.Input(applianceId, appliance.type(), profile, baseline, samples,
                lastSeen, now, liveKinds,
                () -> readings.minuteSamples(dev, baseline.learnedFrom(), baseline.learnedTo())));
        var plan = AlertReconciler.reconcile(live, evaluation, props.evaluation().resolveAfterClearRuns());

        plan.toOpen().forEach(f -> alerts.insert(appliance.ownerUid(), applianceId, f, now, device.get().simulated()));
        plan.toRefresh().forEach(r -> alerts.refresh(r.alertId(), r.finding(), now));
        plan.toTick().forEach(t -> alerts.tick(t.alertId(), t.clearStreak(), now));
        plan.toResolve().forEach(id -> alerts.resolve(id, now));
        if (!plan.isEmpty()) {
            LOG.info("appliance {}: opened={} refreshed={} resolved={}", applianceId, plan.toOpen().size(),
                    plan.toRefresh().size(), plan.toResolve().size());
        }
        return plan;
    }

    /**
     * Learns the baseline now from the readings in [learnFrom, learnTo) instead of waiting for the learning period to
     * elapse (used by the built-in simulator, which hands over a whole history at once). The window is capped at the
     * configured learning period. Leaves the appliance LEARNING when the window holds too little usable data.
     */
    @Transactional
    public boolean learnBaselineNow(UUID applianceId, Instant learnFrom, Instant learnTo) {
        Appliance appliance = appliances.findInternal(applianceId).orElseThrow(() -> new NotFoundException("Appliance"));
        Device device = devices.findActiveForAppliance(applianceId).orElseThrow(() -> new NotFoundException("Device"));
        Instant now = clock.instant();
        Instant to = learnTo.isBefore(learnFrom.plus(Duration.ofDays(props.evaluation().learnDays())))
                ? learnTo : learnFrom.plus(Duration.ofDays(props.evaluation().learnDays()));
        baselines.startLearning(applianceId, learnFrom, now);
        Optional<Baseline> learned = BaselineLearner.learn(readings.minuteSamples(device, learnFrom, to),
                DetectorProfile.forType(appliance.type()), learnFrom, to);
        learned.ifPresent(b -> baselines.saveReady(applianceId, b, now));
        return learned.isPresent();
    }

    /** Null while the appliance is still learning. Learns (and stores) the baseline once enough data exists. */
    private Baseline currentBaseline(Appliance appliance, Device device, DetectorProfile profile, Instant now) {
        var row = baselines.find(appliance.id());
        if (row.isEmpty()) {
            Optional<Instant> first = readings.firstReading(device.id());
            if (first.isEmpty()) {
                return null;
            }
            baselines.startLearning(appliance.id(), first.get(), now);
            row = baselines.find(appliance.id());
        }
        var r = row.get();
        if (r.status() == BaselineRepository.Status.READY) {
            return r.stats();
        }
        Instant learnTo = r.learnFrom().plus(Duration.ofDays(props.evaluation().learnDays()));
        if (now.isBefore(learnTo)) {
            return null;
        }
        List<MinuteSample> window = readings.minuteSamples(device, r.learnFrom(), learnTo);
        Optional<Baseline> learned = BaselineLearner.learn(window, profile, r.learnFrom(), learnTo);
        if (learned.isPresent()) {
            baselines.saveReady(appliance.id(), learned.get(), now);
            LOG.info("appliance {}: baseline learned from {} windows", appliance.id(), learned.get().windowsUsed());
            return learned.get();
        }
        // not enough usable data in that window (outages, sensor offline): slide the learning window forward a day
        baselines.startLearning(appliance.id(), r.learnFrom().plus(Duration.ofDays(1)), now);
        return null;
    }
}
