package com.personalplatform.waitingon;

import static com.personalplatform.waitingon.StubJwtConfig.bearer;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.waitingon.inbound.smtp.InboundSmtpServer;
import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.Transport;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import java.io.BufferedReader;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The built-in SMTP listener end to end: real SMTP over TCP on a random port (Jakarta Mail as the sending client for
 * the happy path, a plain socket where the exact reply codes matter) -> parser -> the same reply pipeline as the
 * webhook -> Postgres timeline + workflow signal on Temporal's test server.
 */
@Import({TestcontainersConfiguration.class, StubJwtConfig.class, TestTemporalConfig.class})
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.inbound.smtp.enabled=true",
        "app.inbound.smtp.port=0",
        "app.inbound.smtp.max-message-size=64KB",
        "app.inbound.smtp.max-messages-per-connection=2",
        // every test connects from 127.0.0.1: keep the per-IP windows out of the way except where tested
        "app.inbound.smtp.max-connections-per-ip-per-minute=10000",
        "app.inbound.smtp.max-messages-per-ip-per-hour=10000",
        "app.inbound.reply-domain=reply.example.com"})
class InboundSmtpTest {

    @Autowired MockMvc mvc;
    @Autowired InboundSmtpServer smtp;

    // ------------------------------------------------------------------ helpers

    private static final String PLAN =
            "{\"nudgeAfterDays\":2,\"escalateAfterDays\":5,\"finalNoticeAfterDays\":0,\"expireAfterDays\":10}";

    private String create(String uid, String title) throws Exception {
        String json = """
                {"title":"%s","counterparty":"Shop Ltd","counterpartyEmail":"help@shop.example",
                 "category":"REFUND","amount":40,"currency":"GBP","expectedBy":"%s","plan":%s}
                """.formatted(title, LocalDate.now().plusDays(1), PLAN);
        String body = mvc.perform(post("/v1/items").header("Authorization", bearer(uid))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    private String item(String uid, String id, String path) throws Exception {
        String body = mvc.perform(get("/v1/items/" + id).header("Authorization", bearer(uid)))
                .andReturn().getResponse().getContentAsString();
        Object v = JsonPath.read(body, path);
        return v == null ? null : v.toString();
    }

    private String timeline(String uid, String id) throws Exception {
        return mvc.perform(get("/v1/items/" + id + "/timeline").header("Authorization", bearer(uid)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private List<String> timelineTypes(String uid, String id) throws Exception {
        return JsonPath.read(timeline(uid, id), "$[*].type");
    }

    private static void eventually(BooleanSupplier condition, String what) throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
        while (System.nanoTime() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            Thread.sleep(25);
        }
        throw new AssertionError("Timed out waiting for: " + what);
    }

    private void awaitStatus(String uid, String id, String expected) throws InterruptedException {
        eventually(() -> {
            try {
                return expected.equals(item(uid, id, "$.status"));
            } catch (Exception e) {
                return false;
            }
        }, "status " + expected);
    }

    /** Minimal SMTP client over a plain socket: returns each reply's full text, so tests can assert exact codes. */
    final class Smtp implements Closeable {
        final Socket socket;
        final BufferedReader in;
        final OutputStream out;
        final String greeting;

        Smtp() throws IOException {
            socket = new Socket("127.0.0.1", smtp.port());
            socket.setSoTimeout(10_000);
            in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
            out = socket.getOutputStream();
            greeting = reply();
        }

        String reply() throws IOException {
            StringBuilder sb = new StringBuilder();
            String line;
            do {
                line = in.readLine();
                if (line == null) {
                    return sb.isEmpty() ? null : sb.toString();
                }
                sb.append(line).append('\n');
            } while (line.length() > 3 && line.charAt(3) == '-');
            return sb.toString();
        }

        String send(String command) throws IOException {
            out.write((command + "\r\n").getBytes(StandardCharsets.US_ASCII));
            out.flush();
            return reply();
        }

        /** EHLO + MAIL FROM, asserting both are accepted. */
        Smtp begin() throws IOException {
            assertThat(send("EHLO client.example")).startsWith("250");
            assertThat(send("MAIL FROM:<support@shop.example>")).startsWith("250");
            return this;
        }

        String data(String message) throws IOException {
            assertThat(send("DATA")).startsWith("354");
            String body = message.replace("\r\n", "\n").replace("\n", "\r\n");
            out.write(body.getBytes(StandardCharsets.UTF_8));
            return send((body.endsWith("\r\n") ? "" : "\r\n") + ".");
        }

        boolean closedByServer() throws IOException {
            try {
                return in.readLine() == null;
            } catch (java.net.SocketException e) {
                return true;
            }
        }

        @Override
        public void close() throws IOException {
            socket.close();
        }
    }

    private static String rawReply(String to, String messageId, String text) {
        return """
                From: Shop Support <support@shop.example>
                To: %s
                Subject: Re: Following up
                Message-ID: <%s>
                Content-Type: text/plain; charset=UTF-8

                %s
                """.formatted(to, messageId, text);
    }

    // ------------------------------------------------------------------ the reply arrives by email

    @Test
    void realSmtpReplyFromAJakartaMailClientResolvesTheItem() throws Exception {
        String uid = "uid-smtp-paid";
        String id = create(uid, "Hotel refund");
        String replyAddress = item(uid, id, "$.replyAddress");
        assertThat(replyAddress).endsWith("@reply.example.com");

        Properties p = new Properties();
        p.put("mail.smtp.host", "127.0.0.1");
        p.put("mail.smtp.port", String.valueOf(smtp.port()));
        p.put("mail.smtp.from", "bounces@shop.example");
        Session session = Session.getInstance(p);
        MimeMessage msg = new MimeMessage(session);
        msg.setFrom(new InternetAddress("support@shop.example", "Shop Support"));
        msg.setRecipient(Message.RecipientType.TO, new InternetAddress(replyAddress));
        msg.setSubject("Re: Following up: Hotel refund");
        MimeBodyPart plain = new MimeBodyPart();
        plain.setText("""
                Hi, your refund has been processed and will arrive in 3 days.

                On Tue, 24 Nov 2026 at 10:12, You <%s> wrote:
                > We regret nothing. Has it been declined?
                """.formatted(replyAddress), "UTF-8");
        MimeBodyPart html = new MimeBodyPart();
        html.setContent("<div>Hi, your refund has been processed.</div><blockquote>declined?</blockquote>",
                "text/html; charset=UTF-8");
        msg.setContent(new MimeMultipart("alternative", plain, html));
        Transport.send(msg);

        awaitStatus(uid, id, "RESOLVED");
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED", "REPLY_RECEIVED", "RESOLVED");
        String reply = JsonPath.read(timeline(uid, id), "$[1].summary").toString();
        String detail = JsonPath.read(timeline(uid, id), "$[1].detail").toString();
        assertThat(reply).isEqualTo("Reply from support@shop.example classified as PAID");
        assertThat(detail).contains("Subject: Re: Following up: Hotel refund")
                .contains("your refund has been processed").doesNotContain("wrote:").doesNotContain("declined");
    }

    @Test
    void rejectedReplyEscalatesAndAResentMessageIdIsNotAppliedTwice() throws Exception {
        String uid = "uid-smtp-rejected";
        String id = create(uid, "Gym fee");
        String to = item(uid, id, "$.replyAddress");
        String mail = rawReply(to, "same-id@shop.example", "We regret to inform you that your request was declined.");

        try (Smtp s = new Smtp()) {
            assertThat(s.greeting).startsWith("220");
            s.begin();
            assertThat(s.send("RCPT TO:<" + to + ">")).startsWith("250");
            assertThat(s.data(mail)).startsWith("250");
            assertThat(s.send("QUIT")).startsWith("221");
        }
        awaitStatus(uid, id, "ESCALATED");

        try (Smtp s = new Smtp()) { // the sending server retries the same message
            s.begin();
            assertThat(s.send("RCPT TO:<" + to.toUpperCase() + ">")).as("addresses are case-insensitive").startsWith("250");
            assertThat(s.data(mail)).startsWith("250");
        }
        assertThat(timelineTypes(uid, id)).filteredOn("REPLY_RECEIVED"::equals).hasSize(1);
    }

    // ------------------------------------------------------------------ refusals (never an open relay)

    @Test
    void refusesEveryRecipientThatIsNotAnOpenItemsReplyAddress() throws Exception {
        String uid = "uid-smtp-refusals";
        String open = create(uid, "Open one");
        String closed = create(uid, "Closed one");
        mvc.perform(post("/v1/items/" + closed + "/cancel").header("Authorization", bearer(uid)))
                .andExpect(status().isOk());
        String openAddress = item(uid, open, "$.replyAddress");
        String token = openAddress.substring("waiting+".length(), openAddress.indexOf('@'));

        List<String> refused = List.of(
                "someone@gmail.com",                                  // relay attempt
                "waiting+" + token + "@other.example",                 // right token, wrong domain
                "waiting+00000000000000000000@reply.example.com",      // unknown token
                item(uid, closed, "$.replyAddress"),                   // closed item
                "reply+" + token + "@reply.example.com",               // wrong local part
                "postmaster@reply.example.com");
        for (String rcpt : refused) {
            try (Smtp s = new Smtp()) {
                s.begin();
                assertThat(s.send("RCPT TO:<" + rcpt + ">")).as(rcpt).startsWith("550");
                assertThat(s.send("DATA")).as("no recipient, no data").startsWith("503");
            }
        }
        assertThat(timelineTypes(uid, closed)).containsExactly("CREATED", "CANCELLED");
    }

    @Test
    void refusesASecondRecipient() throws Exception {
        String uid = "uid-smtp-two";
        String a = item(uid, create(uid, "A"), "$.replyAddress");
        String b = item(uid, create(uid, "B"), "$.replyAddress");
        try (Smtp s = new Smtp()) {
            s.begin();
            assertThat(s.send("RCPT TO:<" + a + ">")).startsWith("250");
            assertThat(s.send("RCPT TO:<" + b + ">")).startsWith("452");
        }
    }

    @Test
    void refusesOversizeMessagesAndKeepsTheConversationInSync() throws Exception {
        String uid = "uid-smtp-big";
        String id = create(uid, "Big");
        String to = item(uid, id, "$.replyAddress");
        try (Smtp s = new Smtp()) {
            assertThat(s.send("EHLO client.example")).contains("SIZE 65536");
            assertThat(s.send("MAIL FROM:<a@shop.example> SIZE=900000")).as("declared size").startsWith("552");
        }
        try (Smtp s = new Smtp()) {
            s.begin();
            assertThat(s.send("RCPT TO:<" + to + ">")).startsWith("250");
            String huge = rawReply(to, "big@shop.example", ("paid " + "x".repeat(70)  + "\n").repeat(1_000));
            assertThat(s.data(huge)).startsWith("552");
            assertThat(s.send("NOOP")).as("still in sync after the rejection").startsWith("250");
        }
        assertThat(timelineTypes(uid, id)).containsExactly("CREATED");
    }

    // ------------------------------------------------------------------ rate limits

    @Test
    void dropsTheConnectionAfterTooManyRefusedRecipients() throws Exception {
        try (Smtp s = new Smtp()) {
            s.begin();
            assertThat(s.send("RCPT TO:<waiting+00000000000000000001@reply.example.com>")).startsWith("550");
            assertThat(s.send("RCPT TO:<waiting+00000000000000000002@reply.example.com>")).startsWith("550");
            assertThat(s.send("RCPT TO:<waiting+00000000000000000003@reply.example.com>")).startsWith("550");
            assertThat(s.closedByServer()).isTrue();
        }
    }

    @Test
    void limitsMessagesPerConnection() throws Exception {
        String uid = "uid-smtp-per-conn";
        String id = create(uid, "Chatty");
        String to = item(uid, id, "$.replyAddress");
        try (Smtp s = new Smtp()) {
            for (int i = 0; i < 2; i++) {
                s.begin();
                assertThat(s.send("RCPT TO:<" + to + ">")).startsWith("250");
                assertThat(s.data(rawReply(to, "m" + i + "@shop.example", "I am away until Monday."))).startsWith("250");
            }
            assertThat(s.send("MAIL FROM:<support@shop.example>")).startsWith("421");
            assertThat(s.closedByServer()).isTrue();
        }
        eventually(() -> {
            try {
                return timelineTypes(uid, id).stream().filter("REPLY_RECEIVED"::equals).count() == 2;
            } catch (Exception e) {
                return false;
            }
        }, "two replies recorded");
    }

    @Test
    void limitsConcurrentConnectionsPerIp() throws Exception {
        eventually(() -> {
            List<Smtp> open = new ArrayList<>();
            try {
                for (int i = 0; i < 3; i++) {
                    Smtp s = new Smtp();
                    open.add(s);
                    if (!s.greeting.startsWith("220")) {
                        return false; // an earlier test's session had not ended yet: try again
                    }
                }
                Smtp fourth = new Smtp();
                open.add(fourth);
                return fourth.greeting != null && fourth.greeting.startsWith("421");
            } catch (IOException e) {
                return false;
            } finally {
                for (Smtp s : open) {
                    try {
                        s.close();
                    } catch (IOException ignored) {
                        // closing
                    }
                }
            }
        }, "fourth concurrent connection refused with 421");
        Thread.sleep(200); // let the server notice the closed sessions
        try (Smtp s = new Smtp()) {
            assertThat(s.greeting).as("slots are released when connections end").startsWith("220");
        }
    }
}
