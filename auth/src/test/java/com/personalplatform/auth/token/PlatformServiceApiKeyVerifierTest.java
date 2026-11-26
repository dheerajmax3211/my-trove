package com.personalplatform.auth.token;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.auth.config.AppProperties;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The HTTP side of the verifier against a stub of the platform service's internal verify endpoint. */
class PlatformServiceApiKeyVerifierTest {

    static final String INTERNAL = "internal-secret";
    static final String OWNER = "0190f0a0-0000-7000-8000-000000000001";
    static final String APP = "0190f0a0-0000-7000-8000-000000000002";
    static final String KEY_ID = "0190f0a0-0000-7000-8000-000000000003";
    static final String BOOM_KEY_ID = "0190f0a0-0000-7000-8000-000000000004";

    private HttpServer server;
    private final AtomicReference<String> lastInternalKey = new AtomicReference<>();
    private final AtomicReference<String> lastBody = new AtomicReference<>();
    private PlatformServiceApiKeyVerifier verifier;

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/internal/v1/api-keys/verify", exchange -> {
            lastInternalKey.set(exchange.getRequestHeaders().getFirst("X-Internal-Key"));
            lastBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            String body = lastBody.get();
            if (body.contains("pk_good")) {
                respond(exchange, 200, "{\"keyId\":\"" + KEY_ID + "\",\"appId\":\"" + APP + "\",\"ownerUid\":\"" + OWNER
                        + "\",\"scopes\":[\"usage:read\"],\"permissions\":[\"usage:read:self\"],\"expiresAt\":null}");
            } else if (body.contains("pk_boom")) {
                respond(exchange, 500, "{\"title\":\"boom\"}");
            } else {
                respond(exchange, 401, "{\"status\":401,\"detail\":\"The API key is invalid, expired or revoked\"}");
            }
        });
        server.createContext("/internal/v1/api-keys/status", exchange -> {
            lastInternalKey.set(exchange.getRequestHeaders().getFirst("X-Internal-Key"));
            lastBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            String body = lastBody.get();
            if (body.contains(KEY_ID)) {
                respond(exchange, 200, "{\"keyId\":\"" + KEY_ID + "\",\"appId\":\"" + APP + "\",\"ownerUid\":\"" + OWNER
                        + "\",\"state\":\"REVOKED\",\"permissions\":[\"mcp:use\",\"products:use\"]}");
            } else if (body.contains(BOOM_KEY_ID)) {
                respond(exchange, 500, "{\"title\":\"boom\"}");
            } else {
                respond(exchange, 404, "{\"status\":404}");
            }
        });
        server.start();
        String url = "http://127.0.0.1:" + server.getAddress().getPort();
        verifier = new PlatformServiceApiKeyVerifier(new AppProperties.PlatformService(url, INTERNAL));
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private static void respond(com.sun.net.httpserver.HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    @Test
    void sendsTheInternalKeyAndMapsAValidKey() {
        VerifiedApiKey v = verifier.verify("pk_good0000_secret");
        assertThat(lastInternalKey.get()).isEqualTo(INTERNAL);
        assertThat(lastBody.get()).contains("\"key\":\"pk_good0000_secret\"");
        assertThat(v.keyId().toString()).isEqualTo(KEY_ID);
        assertThat(v.appId().toString()).isEqualTo(APP);
        assertThat(v.ownerUid()).isEqualTo(OWNER);
        assertThat(v.scopes()).containsExactly("usage:read");
        assertThat(v.permissions()).containsExactly("usage:read:self");
    }

    @Test
    void aRefusalBecomesInvalidApiKey() {
        assertThatThrownBy(() -> verifier.verify("pk_nope0000_secret")).isInstanceOf(InvalidApiKeyException.class);
    }

    @Test
    void aPlatformServiceErrorBecomesAnOutage() {
        assertThatThrownBy(() -> verifier.verify("pk_boom0000_secret"))
                .isInstanceOf(ApiKeyServiceUnavailableException.class);
    }

    @Test
    void anUnreachablePlatformServiceBecomesAnOutage() {
        server.stop(0);
        assertThatThrownBy(() -> verifier.verify("pk_good0000_secret"))
                .isInstanceOf(ApiKeyServiceUnavailableException.class);
    }

    @Test
    void statusSendsTheInternalKeyAndMapsTheState() {
        ApiKeyStatus s = verifier.status(java.util.UUID.fromString(KEY_ID));
        assertThat(lastInternalKey.get()).isEqualTo(INTERNAL);
        assertThat(lastBody.get()).contains("\"keyId\":\"" + KEY_ID + "\"");
        assertThat(s.state()).isEqualTo(ApiKeyStatus.State.REVOKED);
        assertThat(s.appId().toString()).isEqualTo(APP);
        assertThat(s.ownerUid()).isEqualTo(OWNER);
        assertThat(s.permissions()).containsExactly("mcp:use", "products:use");
    }

    @Test
    void statusOfAnUnknownKeyIsInvalidAndAnErrorIsAnOutage() {
        assertThatThrownBy(() -> verifier.status(java.util.UUID.randomUUID())).isInstanceOf(InvalidApiKeyException.class);
        assertThatThrownBy(() -> verifier.status(java.util.UUID.fromString(BOOM_KEY_ID)))
                .isInstanceOf(ApiKeyServiceUnavailableException.class);
    }
}
