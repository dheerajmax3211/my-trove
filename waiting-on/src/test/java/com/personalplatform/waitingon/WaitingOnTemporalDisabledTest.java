package com.personalplatform.waitingon;

import static com.personalplatform.waitingon.StubJwtConfig.bearer;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.waitingon.temporal.NoopFollowUpScheduler;
import com.personalplatform.waitingon.workflow.FollowUpScheduler;
import io.temporal.client.WorkflowClient;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** app.temporal.enabled=false: the whole service starts and works without Temporal; nothing is followed up. */
@Import({TestcontainersConfiguration.class, StubJwtConfig.class})
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {"app.temporal.enabled=false", "app.inbound.secret="})
class WaitingOnTemporalDisabledTest {

    @Autowired MockMvc mvc;
    @Autowired ApplicationContext ctx;
    @Autowired FollowUpScheduler scheduler;

    @Test
    void noTemporalBeansAreCreated() {
        assertThat(scheduler).isInstanceOf(NoopFollowUpScheduler.class);
        assertThat(ctx.getBeansOfType(WorkflowClient.class)).isEmpty();
    }

    @Test
    void apiStillWorksWithoutFollowUps() throws Exception {
        String body = mvc.perform(post("/v1/items").header("Authorization", bearer("uid-noop"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"t\",\"counterparty\":\"c\",\"category\":\"OTHER\",\"expectedBy\":\"%s\"}"
                                .formatted(LocalDate.now().plusDays(3))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");

        mvc.perform(get("/v1/items/" + id).header("Authorization", bearer("uid-noop")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.followUp").doesNotExist());
        mvc.perform(post("/v1/items/" + id + "/snooze").header("Authorization", bearer("uid-noop"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"days\":2}")).andExpect(status().isOk());
        mvc.perform(post("/v1/items/" + id + "/resolve").header("Authorization", bearer("uid-noop")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RESOLVED"));
    }

    @Test
    void nextStepComesFromThePlanAndSaysSo() throws Exception {
        String body = mvc.perform(post("/v1/items").header("Authorization", bearer("uid-noop-plan"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"title\":\"t\",\"counterparty\":\"c\",\"category\":\"OTHER\",\"expectedBy\":\"%s\","
                                + "\"plan\":{\"nudgeAfterDays\":2,\"escalateAfterDays\":5,\"finalNoticeAfterDays\":0,"
                                + "\"expireAfterDays\":10}}").formatted(LocalDate.now().plusDays(3))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.nextStep.action").value("NUDGE"))
                .andExpect(jsonPath("$.nextStep.source").value("PLAN"))
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.id");
        Instant createdAt = OffsetDateTime.parse(JsonPath.<String>read(body, "$.createdAt")).toInstant();

        String list = mvc.perform(get("/v1/items").header("Authorization", bearer("uid-noop-plan")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].nextStep.source").value("PLAN"))
                .andExpect(jsonPath("$[0].followUp").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertThat(Instant.parse(JsonPath.read(list, "$[0].nextStep.at")))
                .isEqualTo(createdAt.plus(Duration.ofDays(2)));

        mvc.perform(post("/v1/items/" + id + "/resolve").header("Authorization", bearer("uid-noop-plan")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.nextStep").doesNotExist());
    }

    @Test
    void blankWebhookSecretFailsClosed() throws Exception {
        mvc.perform(post("/v1/webhooks/inbound-email").header("X-Webhook-Secret", "")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"to\":\"x\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/v1/webhooks/inbound-email").contentType(MediaType.APPLICATION_JSON)
                .content("{\"to\":\"x\"}")).andExpect(status().isUnauthorized());
    }
}
