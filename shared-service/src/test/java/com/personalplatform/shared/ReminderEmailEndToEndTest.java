package com.personalplatform.shared;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.notify.NotificationRelay;
import com.personalplatform.shared.reminder.ReminderEngine;
import com.personalplatform.shared.reminder.ReminderService;
import com.personalplatform.notify.ContactDirectory;
import com.jayway.jsonpath.JsonPath;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * The whole path, with SMTP switched on: a reminder comes due, the outbox row is written, the relay sends it, and the
 * email is waiting in Mailpit. The in-app inbox shows the same notification to its recipient.
 */
@Testcontainers
@SpringBootTest
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, StubJwtConfig.class})
@TestPropertySource(properties = {
        "app.scheduler.enabled=false",
        "app.files.local-root=target/test-blobs-mail",
        "app.files.token-secret=test-secret-test-secret-test-secret-0123456789",
        "app.mail.public-base-url=http://localhost:5190",
})
class ReminderEmailEndToEndTest {

    @Container
    static final GenericContainer<?> MAILPIT = new GenericContainer<>("axllent/mailpit:latest")
            .withExposedPorts(1025, 8025)
            .waitingFor(Wait.forHttp("/readyz").forPort(8025));

    @DynamicPropertySource
    static void smtp(DynamicPropertyRegistry registry) {
        registry.add("app.mail.enabled", () -> "true");
        registry.add("app.mail.host", MAILPIT::getHost);
        registry.add("app.mail.port", () -> MAILPIT.getMappedPort(1025));
    }

    @Autowired ReminderService reminders;
    @Autowired ReminderEngine engine;
    @Autowired NotificationRelay relay;
    @Autowired ContactDirectory contacts;
    @Autowired org.springframework.test.web.servlet.MockMvc mvc;

    private final HttpClient http = HttpClient.newHttpClient();

    private String mailpit(String path) throws Exception {
        String url = "http://" + MAILPIT.getHost() + ":" + MAILPIT.getMappedPort(8025) + path;
        return http.send(HttpRequest.newBuilder(URI.create(url)).GET().build(), HttpResponse.BodyHandlers.ofString())
                .body();
    }

    @Test
    void aDueReminderArrivesInMailpitAndInTheRecipientsInbox() throws Exception {
        String member = "member-" + UUID.randomUUID();
        String address = "member-" + UUID.randomUUID().toString().substring(0, 8) + "@example.test";
        // The member signs in (their token carries the email claim), so the address is on file.
        String token = "Bearer " + java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString((member + "|" + address).getBytes(StandardCharsets.UTF_8));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/v1/notifications")
                .header("Authorization", token)).andReturn();
        assertThat(contacts.emailFor(member)).contains(address);

        String title = "Water the plants " + UUID.randomUUID();
        reminders.create(member, title, Instant.now().minus(Duration.ofMinutes(1)), null, null);
        assertThat(engine.fireDue()).isNotEmpty();
        relay.dispatchDue(10);

        String search = URLEncoder.encode("subject:\"" + title + "\"", StandardCharsets.UTF_8);
        String listing = mailpit("/api/v1/search?query=" + search);
        assertThat(JsonPath.<java.util.List<?>>read(listing, "$.messages")).hasSize(1);
        assertThat(JsonPath.<String>read(listing, "$.messages[0].To[0].Address")).isEqualTo(address);

        String inbox = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(
                        "/v1/notifications/unread-count").header("Authorization", bearer(member)))
                .andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<Integer>read(inbox, "$.count")).isEqualTo(1);
    }

    private static String bearer(String uid) {
        return "Bearer " + java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString(uid.getBytes(StandardCharsets.UTF_8));
    }
}
