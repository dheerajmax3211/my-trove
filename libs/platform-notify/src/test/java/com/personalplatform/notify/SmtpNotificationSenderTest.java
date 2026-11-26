package com.personalplatform.notify;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.notify.NotificationSender.Message;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Real SMTP delivery into a Mailpit container, read back through Mailpit's HTTP API. */
@Testcontainers
class SmtpNotificationSenderTest {

    private static final int SMTP = 1025;
    private static final int HTTP = 8025;

    @Container
    static final GenericContainer<?> MAILPIT = new GenericContainer<>("axllent/mailpit:latest")
            .withExposedPorts(SMTP, HTTP)
            .waitingFor(Wait.forHttp("/readyz").forPort(HTTP));

    private static final ObjectMapper JSON = new ObjectMapper();
    private final HttpClient http = HttpClient.newHttpClient();

    private NotifyProperties props(int smtpPort) {
        return new NotifyProperties(true, MAILPIT.getHost(), smtpPort, "My-Trove <no-reply@platform.test>",
                "http://localhost:5190", null, null, false);
    }

    private JsonNode mailpit(String path) throws Exception {
        String url = "http://" + MAILPIT.getHost() + ":" + MAILPIT.getMappedPort(HTTP) + path;
        HttpResponse<String> r = http.send(HttpRequest.newBuilder(URI.create(url)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        return JSON.readTree(r.body());
    }

    @Test
    void deliversSubjectBodyLinkAndReplyToThroughSmtp() throws Exception {
        SmtpNotificationSender sender = new SmtpNotificationSender(props(MAILPIT.getMappedPort(SMTP)));
        String subject = "Bins out " + UUID.randomUUID();
        sender.send(new Message(UUID.randomUUID(), "REMINDER", "uid-1", "member@example.test", subject,
                "Put the bins out tonight.", "/shared/reminders", "reply+abc@reply.platform.test", 1));

        JsonNode list = mailpit("/api/v1/search?query=" + java.net.URLEncoder.encode("subject:\"" + subject + "\"",
                java.nio.charset.StandardCharsets.UTF_8));
        assertThat(list.get("messages")).hasSize(1);
        JsonNode summary = list.get("messages").get(0);
        assertThat(summary.get("To").get(0).get("Address").asText()).isEqualTo("member@example.test");
        assertThat(summary.get("ReplyTo").get(0).get("Address").asText()).isEqualTo("reply+abc@reply.platform.test");
        assertThat(summary.get("From").get("Address").asText()).isEqualTo("no-reply@platform.test");

        JsonNode full = mailpit("/api/v1/message/" + summary.get("ID").asText());
        assertThat(full.get("Text").asText()).contains("Put the bins out tonight.")
                .contains("http://localhost:5190/shared/reminders");
    }

    @Test
    void anUnreachableServerIsAFailureTheRelayCanRetry() {
        SmtpNotificationSender sender = new SmtpNotificationSender(
                new NotifyProperties(true, "127.0.0.1", 1, "no-reply@platform.test", "http://localhost:5190", null, null, false));
        assertThatThrownBy(() -> sender.send(new Message(UUID.randomUUID(), "REMINDER", "u", "x@example.test",
                "t", "b", null, null, 1))).isInstanceOf(Exception.class);
    }

    @Test
    void anAuthenticatedRelayUsesLoginAndRequiredStarttls() {
        SmtpNotificationSender sender = new SmtpNotificationSender(new NotifyProperties(true, "smtp-relay.example",
                587, "no-reply@platform.test", "http://localhost:5190", "apikey", "s3cret-value", true));
        var mailer = sender.mailer();
        assertThat(mailer.getUsername()).isEqualTo("apikey");
        assertThat(mailer.getPassword()).isEqualTo("s3cret-value");
        assertThat(mailer.getJavaMailProperties()).containsEntry("mail.smtp.auth", "true")
                .containsEntry("mail.smtp.starttls.enable", "true")
                .containsEntry("mail.smtp.starttls.required", "true");
    }

    @Test
    void aLocalRelayNeedsNoLoginAndNoTls() {
        var mailer = new SmtpNotificationSender(new NotifyProperties(true, "localhost", 1025, "a@b.test",
                "http://localhost:5190", null, null, false)).mailer();
        assertThat(mailer.getUsername()).isNull();
        assertThat(mailer.getJavaMailProperties()).doesNotContainKey("mail.smtp.auth")
                .doesNotContainKey("mail.smtp.starttls.enable");
    }

    @Test
    void thePasswordNeverAppearsInTheSettingsAsText() {
        NotifyProperties props = new NotifyProperties(true, "smtp-relay.example", 587, "a@b.test",
                "http://localhost:5190", "apikey", "s3cret-value", true);
        assertThat(props.toString()).doesNotContain("s3cret-value").contains("[redacted]");
    }
}
