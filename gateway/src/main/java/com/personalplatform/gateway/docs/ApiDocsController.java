package com.personalplatform.gateway.docs;

import com.personalplatform.gateway.config.GatewayProperties;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * The index of the services' OpenAPI documents, served by the gateway at {@code /api/platform/v1/docs}. Each configured
 * service is probed at {@code /v3/api-docs}; a service is listed as available only when that answers 200 with an OpenAPI
 * document. Served by a controller, so it is not routed (and not authenticated) like the services behind it.
 */
@RestController
@RequestMapping("/api/platform/v1/docs")
public class ApiDocsController {

    static final String DOCS_PATH = "/v3/api-docs";
    private static final Duration PROBE_TIMEOUT = Duration.ofSeconds(2);

    private final GatewayProperties props;
    private final WebClient client;

    public ApiDocsController(GatewayProperties props) {
        this.props = props;
        this.client = WebClient.builder().build();
    }

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<Map<String, Object>> index() {
        List<Mono<Map<String, Object>>> probes = new ArrayList<>();
        props.services().keySet().stream().sorted().forEach(name ->
                probes.add(probe(name, props.services().get(name).uri())));
        return Flux.merge(probes).collectList().map(services -> {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("services", services);
            return body;
        });
    }

    private Mono<Map<String, Object>> probe(String name, String baseUri) {
        return client.get().uri(baseUri + DOCS_PATH).exchangeToMono(this::isOpenApi)
                .timeout(PROBE_TIMEOUT)
                .onErrorReturn(false)
                .map(available -> {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("name", name);
                    entry.put("available", available);
                    entry.put("docsPath", "/api/" + name + DOCS_PATH);
                    return entry;
                });
    }

    private Mono<Boolean> isOpenApi(ClientResponse response) {
        HttpStatusCode status = response.statusCode();
        if (!status.is2xxSuccessful()) {
            return response.releaseBody().thenReturn(false);
        }
        return response.bodyToMono(String.class).map(body -> body.contains("\"openapi\"")).defaultIfEmpty(false);
    }
}
