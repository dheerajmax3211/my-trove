package com.personalplatform.waitingon;

import com.personalplatform.waitingon.notify.NotificationPort;
import io.temporal.client.WorkflowClient;
import io.temporal.serviceclient.WorkflowServiceStubs;
import io.temporal.testing.TestWorkflowEnvironment;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

/**
 * Replaces the real Temporal connection with the in-process, time-skipping test server. The production worker and
 * scheduler wiring (TemporalWorkerConfig) is used unchanged on top of it.
 */
@TestConfiguration(proxyBeanMethods = false)
class TestTemporalConfig {

    @Bean(destroyMethod = "close")
    TestWorkflowEnvironment testWorkflowEnvironment() {
        return TestWorkflowEnvironment.newInstance();
    }

    @Bean(destroyMethod = "")
    WorkflowServiceStubs workflowServiceStubs(TestWorkflowEnvironment env) {
        return env.getWorkflowServiceStubs();
    }

    @Bean
    WorkflowClient workflowClient(TestWorkflowEnvironment env) {
        return env.getWorkflowClient();
    }

    @Bean
    NotificationPort notificationPort() {
        return new RecordingNotificationPort();
    }
}
