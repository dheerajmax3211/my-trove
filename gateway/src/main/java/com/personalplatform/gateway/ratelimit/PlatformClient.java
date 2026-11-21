package com.personalplatform.gateway.ratelimit;

import com.personalplatform.gateway.config.GatewayProperties;
import io.netty.channel.ChannelOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reads the plan table and a principal's monthly usage from {@code platform-service /internal/v1/**}, authenticated
 * with {@code X-Internal-Key}. Only ever called from background refreshes, with a short timeout. The key is never
 * logged and never sent to clients.
 */
@Component
public class PlatformClient {

    public record PlanRow(String plan, int requestsPerMinute, long requestsPerMonth) {}

    private static final Logger log = LoggerFactory.getLogger(PlatformClient.class);
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String KEY_HEADER = "X-Internal-Key";

    private final WebClient webClient;
    private final String apiKey;
    private final Duration timeout;

    public PlatformClient(GatewayProperties props) {
        this.apiKey = props.internal().apiKey();
        this.timeout = props.rateLimit().platformTimeout();
        HttpClient http = HttpClient.create()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, (int) Math.min(timeout.toMillis(), Integer.MAX_VALUE))
                .responseTimeout(timeout);
        this.webClient = WebClient.builder()
                .baseUrl(props.services().get("platform").uri())
                .clientConnector(new ReactorClientHttpConnector(http))
                .build();
        if (apiKey == null || apiKey.isBlank()) {
            log.warn("gateway.internal.api-key is not set: plan limits use built-in values and monthly quotas are not enforced");
        }
    }

    public boolean configured() {
        return apiKey != null && !apiKey.isBlank();
    }

    public Mono<List<PlanRow>> plans() {
        if (!configured()) {
            return Mono.empty();
        }
        return get("/internal/v1/plans").map(body -> {
            List<PlanRow> rows = new ArrayList<>();
            JsonNode root = JSON.readTree(body);
            if (root.isArray()) {
                for (JsonNode n : root) {
                    String plan = n.path("plan").asString("");
                    if (!plan.isBlank() && n.path("requestsPerMinute").canConvertToInt()) {
                        rows.add(new PlanRow(plan, n.path("requestsPerMinute").asInt(),
                                n.path("requestsPerMonth").asLong(0)));
                    }
                }
            }
            return rows;
        });
    }

    public Mono<QuotaClient.Quota> quota(String principalId) {
        if (!configured()) {
            return Mono.empty();
        }
        return get("/internal/v1/quota/{principalId}", principalId).map(body -> {
            JsonNode n = JSON.readTree(body);
            return new QuotaClient.Quota(n.path("monthlyLimit").asLong(0), n.path("used").asLong(0));
        });
    }

    private Mono<byte[]> get(String template, Object... variables) {
        return webClient.get().uri(template, variables)
                .header(KEY_HEADER, apiKey)
                .retrieve()
                .bodyToMono(byte[].class)
                .timeout(timeout.plusMillis(250));
    }
}
