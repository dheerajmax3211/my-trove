package com.personalplatform.homepulse.detect;

/** The built-in detector ({@link AnomalyDetector}): robust statistics on 6-hour windows plus run-length and silence rules. */
public final class MadAnomalyModel implements AnomalyModel {

    @Override
    public AnomalyDetector.Evaluation evaluate(Input in) {
        return AnomalyDetector.evaluate(in.profile(), in.baseline(), in.samples(), in.lastSeen(), in.now(), in.liveKinds());
    }
}
