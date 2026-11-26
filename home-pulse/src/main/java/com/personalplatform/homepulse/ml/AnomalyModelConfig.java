package com.personalplatform.homepulse.ml;

import com.personalplatform.homepulse.config.HomePulseProperties;
import com.personalplatform.homepulse.detect.AnomalyModel;
import com.personalplatform.homepulse.detect.MadAnomalyModel;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** {@code ML_SERVICE_URL} empty: the built-in detector alone. Set: ml-service with the built-in detector as fallback. */
@Configuration(proxyBeanMethods = false)
public class AnomalyModelConfig {

    private static final Logger LOG = LoggerFactory.getLogger(AnomalyModelConfig.class);

    @Bean
    AnomalyModel anomalyModel(HomePulseProperties props, ObjectProvider<MeterRegistry> meters) {
        HomePulseProperties.Ml ml = props.ml();
        if (!ml.enabled()) {
            LOG.info("anomaly model: built-in detector (MAD); ML_SERVICE_URL is not set");
            return new MadAnomalyModel();
        }
        LOG.info("anomaly model: ml-service at {} (timeout {}), built-in detector as fallback", ml.url(), ml.timeout());
        return new MlAnomalyModel(new MlServiceClient(ml.url(), ml.timeout(), ml.trainTimeout()), new MadAnomalyModel(),
                ml.retrainBackoff(), meters.getIfAvailable());
    }
}
