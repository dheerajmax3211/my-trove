package com.personalplatform.mcp.tools;

import com.personalplatform.mcp.config.McpProperties;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Read-only calls to the product services with the caller's own platform token. No retries (a tool call is
 * interactive; the agent can retry) and no elevated credential: the service applies its own per-user rules.
 */
@Component
public class Downstream {

    /** Why a downstream call did not produce data. */
    public enum Failure { DENIED, NOT_FOUND, REJECTED, UNAVAILABLE }

    public static final class DownstreamException extends RuntimeException {
        private final Failure failure;
        private final int status;

        DownstreamException(Failure failure, int status, String message) {
            super(message);
            this.failure = failure;
            this.status = status;
        }

        public Failure failure() {
            return failure;
        }

        public int status() {
            return status;
        }
    }

    private final McpProperties props;
    private final HttpClient http;
    private final JsonMapper json = JsonMapper.builder().build();

    public Downstream(McpProperties props) {
        this.props = props;
        this.http = HttpClient.newBuilder().connectTimeout(props.timeout())
                .followRedirects(HttpClient.Redirect.NEVER).build();
    }

    /** A URI builder rooted at the service's base URI; callers add path segments and query parameters. */
    public UriComponentsBuilder uri(String service) {
        return UriComponentsBuilder.fromUriString(props.uri(service));
    }

    public JsonNode get(String service, URI uri, Caller caller) {
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(props.timeout())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + caller.token())
                .header(HttpHeaders.ACCEPT, "application/json")
                .GET()
                .build();
        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (HttpTimeoutException e) {
            throw new DownstreamException(Failure.UNAVAILABLE, 0, service + " did not answer in time");
        } catch (IOException e) {
            throw new DownstreamException(Failure.UNAVAILABLE, 0, service + " is unreachable");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new DownstreamException(Failure.UNAVAILABLE, 0, "interrupted while calling " + service);
        }
        int status = response.statusCode();
        if (status == 401 || status == 403) {
            throw new DownstreamException(Failure.DENIED, status, service + " refused the request (" + status + ")");
        }
        if (status == 404) {
            throw new DownstreamException(Failure.NOT_FOUND, status, service + " found nothing at that id");
        }
        if (status >= 400 && status < 500) {
            throw new DownstreamException(Failure.REJECTED, status, service + " rejected the request (" + status + ")");
        }
        if (status != 200) {
            throw new DownstreamException(Failure.UNAVAILABLE, status, service + " failed (" + status + ")");
        }
        try {
            return json.readTree(response.body());
        } catch (JacksonException e) {
            throw new DownstreamException(Failure.UNAVAILABLE, status, service + " answered with unreadable JSON");
        }
    }
}
