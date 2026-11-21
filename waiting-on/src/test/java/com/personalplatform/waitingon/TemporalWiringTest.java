package com.personalplatform.waitingon;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.waitingon.temporal.TemporalClientAutoConfiguration;
import com.personalplatform.waitingon.temporal.TemporalFailureAnalyzer;
import com.personalplatform.waitingon.temporal.TemporalUnreachableException;
import io.temporal.client.WorkflowClient;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.diagnostics.FailureAnalysis;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/** No Temporal server and no database needed: only the connection wiring is exercised. */
class TemporalWiringTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(TemporalClientAutoConfiguration.class));

    @Test
    void unreachableServerFailsStartupWithAClearError() {
        runner.withPropertyValues("app.temporal.target=127.0.0.1:1", "app.temporal.connect-timeout=1s",
                "app.temporal.namespace=waiting").run(ctx -> {
                    assertThat(ctx).hasFailed();
                    Throwable root = ctx.getStartupFailure();
                    while (root != null && !(root instanceof TemporalUnreachableException)) {
                        root = root.getCause();
                    }
                    assertThat(root).isInstanceOf(TemporalUnreachableException.class)
                            .hasMessageContaining("127.0.0.1:1").hasMessageContaining("namespace 'waiting'");

                    FailureAnalysis analysis = new TemporalFailureAnalyzer().analyze(ctx.getStartupFailure());
                    assertThat(analysis).isNotNull();
                    assertThat(analysis.getDescription()).contains("Cannot reach Temporal at '127.0.0.1:1'");
                    assertThat(analysis.getAction()).contains("temporal server start-dev", "app.temporal.enabled=false");
                });
    }

    @Test
    void disabledPropertySkipsTheConnectionEntirely() {
        runner.withPropertyValues("app.temporal.enabled=false", "app.temporal.target=127.0.0.1:1").run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx).doesNotHaveBean(WorkflowClient.class);
        });
    }
}
