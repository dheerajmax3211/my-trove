package com.personalplatform.mcp.tools;

import com.personalplatform.mcp.config.DelegationProperties;
import com.personalplatform.mcp.config.McpProperties;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Turns an API key caller into its owner for one tool call: sends the key's service token to auth's
 * {@code POST /internal/v1/token/delegate} with the internal key and gets back a short-lived token for the owner whose
 * permissions are (owner's) AND (key's). The answer is verified like any inbound token (signature, issuer, audience,
 * expiry) before it is used. Not cached: every tool call re-checks suspension, revocation and the app.
 */
@Component
public class OwnerDelegation {

    static final String DELEGATE_PATH = "/internal/v1/token/delegate";
    static final String INTERNAL_KEY_HEADER = "X-Internal-Key";

    /** Delegation did not produce a token. {@code refused} is auth saying no; otherwise auth could not be asked. */
    public static final class DelegationException extends RuntimeException {
        private final boolean refused;
        private final String reason;

        DelegationException(boolean refused, String reason, String message) {
            super(message);
            this.refused = refused;
            this.reason = reason;
        }

        public boolean refused() {
            return refused;
        }

        /** auth's problem code (e.g. USER_SUSPENDED, API_KEY_REVOKED, APP_DISABLED), or null. */
        public String reason() {
            return reason;
        }
    }

    private final DelegationProperties props;
    private final JwtDecoder decoder;
    private final HttpClient http;
    private final McpProperties mcp;
    private final JsonMapper json = JsonMapper.builder().build();

    public OwnerDelegation(DelegationProperties props, McpProperties mcp, JwtDecoder decoder) {
        this.props = props;
        this.mcp = mcp;
        this.decoder = decoder;
        this.http = HttpClient.newBuilder().connectTimeout(mcp.timeout())
                .followRedirects(HttpClient.Redirect.NEVER).build();
    }

    /** The owner as a caller: USER type, the delegated token, its permissions; {@code onBehalfOf} kept from the key. */
    public Caller delegate(Caller apiKey) {
        if (apiKey.type() != Caller.Type.API_KEY) {
            throw new IllegalArgumentException("only an API key caller is delegated");
        }
        if (props.internalApiKey().isBlank()) {
            throw new DelegationException(false, null, "API-key delegation is not configured on this server");
        }
        String body = json.writeValueAsString(Map.of("serviceToken", apiKey.token()));
        HttpRequest request = HttpRequest.newBuilder(URI.create(props.authUrl() + DELEGATE_PATH))
                .timeout(mcp.timeout())
                .header(INTERNAL_KEY_HEADER, props.internalApiKey())
                .header(HttpHeaders.CONTENT_TYPE, "application/json")
                .header(HttpHeaders.ACCEPT, "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            throw new DelegationException(false, null, "auth is unreachable");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new DelegationException(false, null, "interrupted while asking auth");
        }
        int status = response.statusCode();
        JsonNode answer = parse(response.body());
        if (status == 401 || status == 403) {
            String code = answer.path("code").isString() ? answer.path("code").asString() : null;
            throw new DelegationException(true, code, "auth refused to let this key act for its owner"
                    + (code == null ? "" : " (" + code + ")"));
        }
        if (status != 200 || !answer.path("accessToken").isString()) {
            throw new DelegationException(false, null, "auth answered " + status);
        }
        Jwt delegated;
        try {
            delegated = decoder.decode(answer.path("accessToken").asString());
        } catch (JwtException e) {
            throw new DelegationException(false, null, "auth returned a token that does not verify");
        }
        boolean actsAsThisApp = delegated.getClaims().get("act") instanceof Map<?, ?> act
                && apiKey.subject().equals(act.get("sub"));
        if (!"platform".equals(delegated.getClaimAsString("token_use")) || !actsAsThisApp) {
            throw new DelegationException(false, null, "auth returned a token that is not a delegated token for this key");
        }
        return new Caller(delegated.getSubject(), Caller.Type.USER, Caller.permissionsOf(delegated),
                delegated.getTokenValue(), apiKey.onBehalfOf());
    }

    private JsonNode parse(String body) {
        try {
            return json.readTree(body == null || body.isBlank() ? "{}" : body);
        } catch (JacksonException e) {
            return json.createObjectNode();
        }
    }
}
