package com.personalplatform.gateway.metering;

import java.util.List;

/** Where batches of usage events finally go. Called only from the publisher's own worker thread. */
@FunctionalInterface
public interface UsageSink {

    /**
     * Delivers the batch, blocking this (non-request) thread as long as it takes up to the sink's own timeouts.
     *
     * @return how many events could not be delivered
     */
    int send(List<UsageEvent> batch) throws Exception;
}
