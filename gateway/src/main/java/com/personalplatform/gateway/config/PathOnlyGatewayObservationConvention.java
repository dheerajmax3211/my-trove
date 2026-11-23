package com.personalplatform.gateway.config;

import io.micrometer.common.KeyValue;
import io.micrometer.common.KeyValues;
import org.springframework.cloud.gateway.filter.headers.observation.DefaultGatewayObservationConvention;
import org.springframework.cloud.gateway.filter.headers.observation.GatewayContext;

/**
 * The stock convention tags {@code http.uri} with the full request URI, query included. The signed download link and the
 * consent OAuth endpoints carry their credential in the query string, so the span would hand it to the trace backend.
 * This convention reports the path only.
 */
public class PathOnlyGatewayObservationConvention extends DefaultGatewayObservationConvention {

    @Override
    public KeyValues getHighCardinalityKeyValues(GatewayContext context) {
        return KeyValues.of(KeyValue.of("http.uri",
                context.getRequest().getURI().getRawPath()));
    }
}
