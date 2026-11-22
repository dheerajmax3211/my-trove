package com.personalplatform.platform.webhooks;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/** Sends one delivery and reports what the receiver answered. */
public interface WebhookSender {

    /** {@code statusCode} is 0 when no HTTP answer was received; {@code error} then says why. */
    record Outcome(int statusCode, String error) {

        public boolean delivered() {
            return statusCode >= 200 && statusCode < 300;
        }
    }

    Outcome send(String url, Map<String, String> headers, String body);

    /** The production sender: a POST with a 3 s connect and 5 s total budget; redirects are not followed. */
    final class Http implements WebhookSender {

        private static final int MAX_ERROR = 500;

        private final HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();

        @Override
        public Outcome send(String url, Map<String, String> headers, String body) {
            HttpRequest.Builder request;
            try {
                request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(5))
                        .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
            } catch (IllegalArgumentException e) {
                return new Outcome(0, "invalid endpoint URL");
            }
            headers.forEach(request::header);
            try {
                HttpResponse<Void> response = client.send(request.build(), HttpResponse.BodyHandlers.discarding());
                return new Outcome(response.statusCode(), null);
            } catch (IOException e) {
                String message = e.getClass().getSimpleName() + (e.getMessage() == null ? "" : ": " + e.getMessage());
                return new Outcome(0, message.length() > MAX_ERROR ? message.substring(0, MAX_ERROR) : message);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return new Outcome(0, "interrupted");
            }
        }
    }
}
