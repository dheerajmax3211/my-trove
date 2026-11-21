package com.personalplatform.gateway.metering;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.LinkedBlockingDeque;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Hands usage events to a {@link UsageSink} without ever making a request wait.
 *
 * <p>{@link #publish} is a constant-time offer onto a bounded in-memory buffer; when the buffer is full the oldest
 * event is discarded to make room and {@code gateway.usage.dropped{reason="overflow"}} is incremented. A single
 * worker thread drains the buffer in batches and calls the sink; events the sink fails to deliver are counted as
 * {@code reason="send_failed"}. Metering is therefore lossy by design, in exchange for never adding latency or
 * failures to the request path when Kafka is slow or gone.
 */
public class UsagePublisher implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(UsagePublisher.class);

    private final LinkedBlockingDeque<UsageEvent> buffer;
    private final UsageSink sink;
    private final int batchSize;
    private final Counter overflow;
    private final Counter sendFailed;
    private final Thread worker;
    private volatile boolean running = true;
    private volatile long lastFailureLog;

    public UsagePublisher(UsageSink sink, int capacity, int batchSize, MeterRegistry registry) {
        this.sink = sink;
        this.batchSize = batchSize;
        this.buffer = new LinkedBlockingDeque<>(capacity);
        this.overflow = Counter.builder("gateway.usage.dropped").tag("reason", "overflow")
                .description("Usage events discarded before delivery").register(registry);
        this.sendFailed = Counter.builder("gateway.usage.dropped").tag("reason", "send_failed")
                .description("Usage events discarded before delivery").register(registry);
        this.worker = Thread.ofPlatform().daemon().name("usage-publisher").start(this::drainLoop);
    }

    /** Never blocks and never throws. */
    public void publish(UsageEvent event) {
        try {
            while (!buffer.offerLast(event)) {
                if (buffer.pollFirst() != null) {
                    overflow.increment();
                }
            }
        } catch (RuntimeException e) {
            overflow.increment();
        }
    }

    private void drainLoop() {
        List<UsageEvent> batch = new ArrayList<>(batchSize);
        while (running || !buffer.isEmpty()) {
            try {
                UsageEvent first = buffer.pollFirst(200, TimeUnit.MILLISECONDS);
                if (first == null) {
                    continue;
                }
                batch.clear();
                batch.add(first);
                buffer.drainTo(batch, batchSize - 1);
                deliver(batch);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private void deliver(List<UsageEvent> batch) {
        try {
            int failed = sink.send(List.copyOf(batch));
            if (failed > 0) {
                sendFailed.increment(failed);
                logFailure("usage sink could not deliver " + failed + " of " + batch.size() + " events", null);
            }
        } catch (InterruptedException e) {
            sendFailed.increment(batch.size());
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            sendFailed.increment(batch.size());
            logFailure("usage sink failed, dropped " + batch.size() + " events", e);
        }
    }

    /** At most one line every 30 s: a dead broker must not flood the log. */
    private void logFailure(String message, Exception e) {
        long now = System.currentTimeMillis();
        if (now - lastFailureLog > 30_000) {
            lastFailureLog = now;
            log.warn("{}{}", message, e == null ? "" : ": " + e);
        }
    }

    @Override
    public void close() {
        running = false;
        try {
            worker.join(2_000); // let what is already buffered go out, but never hold up shutdown
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        worker.interrupt();
    }
}
