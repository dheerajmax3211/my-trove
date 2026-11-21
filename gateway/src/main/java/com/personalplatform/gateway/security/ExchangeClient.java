package com.personalplatform.gateway.security;

import com.personalplatform.gateway.config.GatewayProperties;
import io.netty.channel.ChannelOption;
import java.net.ConnectException;
import java.util.concurrent.TimeoutException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Calls {@code POST {auth}/v1/token/exchange} with the caller's credential. Never logs the credential. */
@Component
public class ExchangeClient {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final WebClient webClient;
    private final java.time.Duration timeout;

    public ExchangeClient(GatewayProperties props) {
        this.timeout = props.exchange().timeout();
        HttpClient http = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, (int) Math.min(timeout.toMillis(), Integer.MAX_VALUE))
                .responseTimeout(timeout);
        this.webClient = WebClient.builder()
                .baseUrl(props.services().get("auth").uri())
                .clientConnector(new ReactorClientHttpConnector(http))
                .build();
    }

    public Mono<ExchangeResult> exchange(String credential) {
        return webClient.post()
                .uri("/v1/token/exchange")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + credential)
                .exchangeToMono(this::handle)
                .timeout(timeout.plusMillis(250))
                .onErrorMap(e -> !(e instanceof ExchangeFailure), ExchangeClient::unavailable);
    }

    private Mono<ExchangeResult> handle(ClientResponse response) {
        HttpStatusCode status = response.statusCode();
        if (status.value() == 200) {
            return response.bodyToMono(byte[].class).defaultIfEmpty(new byte[0]).map(ExchangeClient::parse);
        }
        if (status.value() == 401 || status.value() == 403 || status.value() == 429) {
            String retryAfter = response.headers().asHttpHeaders().getFirst(HttpHeaders.RETRY_AFTER);
            return response.bodyToMono(byte[].class).defaultIfEmpty(new byte[0])
                    .flatMap(body -> Mono.error(new ExchangeFailure.Rejected(status.value(), body, retryAfter)));
        }
        return response.releaseBody().then(Mono.error(
                new ExchangeFailure.Unavailable("exchange answered " + status.value(), false, null)));
    }

    private static ExchangeResult parse(byte[] body) {
        try {
            JsonNode node = JSON.readTree(body);
            String token = node.path("accessToken").asString("");
            if (token.isBlank()) {
                throw new ExchangeFailure.Unavailable("exchange response has no accessToken", false, null);
            }
            TokenClaims claims = TokenClaims.parse(token);
            CallerIdentity identity = claims.toIdentity();
            if (identity == null) {
                throw new ExchangeFailure.Unavailable("platform token names no principal", false, null);
            }
            return new ExchangeResult(token, claims, identity);
        } catch (ExchangeFailure f) {
            throw f;
        } catch (RuntimeException e) {
            throw new ExchangeFailure.Unavailable("unreadable exchange response", false, e);
        }
    }

    private static ExchangeFailure unavailable(Throwable e) {
        boolean timeout = e instanceof TimeoutException || e.getCause() instanceof TimeoutException
                || e.getClass().getSimpleName().contains("Timeout");
        String reason = e instanceof ConnectException ? "connection refused" : e.getClass().getSimpleName();
        return new ExchangeFailure.Unavailable("exchange unavailable: " + reason, timeout, e);
    }
}
