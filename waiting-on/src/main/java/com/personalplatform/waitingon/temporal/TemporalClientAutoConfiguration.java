package com.personalplatform.waitingon.temporal;

import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowClientOptions;
import io.temporal.serviceclient.WorkflowServiceStubs;
import io.temporal.serviceclient.WorkflowServiceStubsOptions;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

/**
 * Connects to the Temporal frontend at startup and fails fast with {@link TemporalUnreachableException} if it is
 * not there. Registered as an auto-configuration (not a plain @Configuration) so that
 * {@code @ConditionalOnMissingBean} is evaluated after application and test beans: tests supply their own
 * {@link WorkflowClient} backed by the in-process time-skipping test server.
 *
 * <p>Plain Temporal Java SDK wiring on purpose: the official {@code temporal-spring-boot-starter} is built against
 * Spring Boot 2.7 and is not verified with Boot 4 / Jackson 3 (see README).
 */
@AutoConfiguration
@EnableConfigurationProperties(TemporalProperties.class)
@ConditionalOnProperty(prefix = "app.temporal", name = "enabled", havingValue = "true", matchIfMissing = true)
public class TemporalClientAutoConfiguration {

    @Bean(destroyMethod = "shutdown")
    @ConditionalOnMissingBean
    WorkflowServiceStubs workflowServiceStubs(TemporalProperties props) {
        WorkflowServiceStubsOptions options = WorkflowServiceStubsOptions.newBuilder()
                .setTarget(props.target())
                .setEnableHttps(props.tls())
                .build();
        try {
            return WorkflowServiceStubs.newConnectedServiceStubs(options, props.connectTimeout());
        } catch (Exception e) {
            throw new TemporalUnreachableException(props.target(), props.namespace(), e);
        }
    }

    @Bean
    @ConditionalOnMissingBean
    WorkflowClient workflowClient(WorkflowServiceStubs stubs, TemporalProperties props) {
        return WorkflowClient.newInstance(stubs,
                WorkflowClientOptions.newBuilder().setNamespace(props.namespace()).build());
    }
}
