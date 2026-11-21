package com.personalplatform.homepulse.alert;

import com.personalplatform.homepulse.appliance.ApplianceRepository;
import com.personalplatform.homepulse.detect.AlertKind;
import com.personalplatform.homepulse.eval.BaselineRepository;
import com.personalplatform.homepulse.web.NotFoundException;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** After a repair or a service the "normal" changes: forget the baseline and learn it again from now. */
@Service
@Transactional
public class RelearnService {

    private final ApplianceRepository appliances;
    private final BaselineRepository baselines;
    private final AlertRepository alerts;
    private final Clock clock;

    public RelearnService(ApplianceRepository appliances, BaselineRepository baselines, AlertRepository alerts, Clock clock) {
        this.appliances = appliances;
        this.baselines = baselines;
        this.alerts = alerts;
        this.clock = clock;
    }

    public void relearn(String ownerUid, UUID applianceId) {
        appliances.find(ownerUid, applianceId).orElseThrow(() -> new NotFoundException("Appliance"));
        var now = clock.instant();
        baselines.startLearning(applianceId, now, now);
        // alerts that were judged against the old baseline can no longer be evaluated: close them (NO_DATA stays live)
        alerts.liveForAppliance(applianceId).stream()
                .filter(a -> a.kind() != AlertKind.NO_DATA)
                .forEach(a -> alerts.resolve(a.id(), now));
    }
}
