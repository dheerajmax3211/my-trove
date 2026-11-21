package com.personalplatform.sql;

import java.time.Duration;
import java.util.function.Consumer;
import org.jooq.ExecuteContext;
import org.jooq.ExecuteListener;

/**
 * Reports statements that take longer than a threshold. Reports the SQL with bind placeholders
 * (never the bound values), so no user data ends up in logs.
 */
public class SlowQueryListener implements ExecuteListener {

    private static final String START_KEY = SlowQueryListener.class.getName() + ".start";

    private final long thresholdNanos;
    private final Consumer<String> sink;

    public SlowQueryListener(Duration threshold, Consumer<String> sink) {
        this.thresholdNanos = threshold.toNanos();
        this.sink = sink;
    }

    @Override
    public void executeStart(ExecuteContext ctx) {
        ctx.data(START_KEY, System.nanoTime());
    }

    @Override
    public void executeEnd(ExecuteContext ctx) {
        Object start = ctx.data(START_KEY);
        if (!(start instanceof Long startNanos)) {
            return;
        }
        long elapsed = System.nanoTime() - startNanos;
        if (elapsed >= thresholdNanos) {
            sink.accept("Slow query (" + Duration.ofNanos(elapsed).toMillis() + " ms): " + ctx.sql());
        }
    }
}
