package com.personalplatform.auth.token;

import com.personalplatform.auth.config.AppProperties;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Calls the platform service's {@code POST /internal/v1/api-keys/verify} with the shared internal key. A 401 is a
 * refusal of the key; anything else that goes wrong is an outage, so the caller can tell "not valid" from "cannot tell".
 */
public class PlatformServiceApiKeyVerifier implements ApiKeyVerifier {

    static final String VERIFY_PATH = "/internal/v1/api-keys/verify";
    static final String INTERNAL_KEY_HEADER = "X-Internal-Key";

    /** The platform service's answer for a valid key. */
    record Response(UUID keyId, UUID appId, String ownerUid, List<String> scopes, List<String> permissions, String expiresAt) {}

    private final RestClient client;
    private final String internalKey;

    public PlatformServiceApiKeyVerifier(AppProperties.PlatformService config) {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(2)).build());
        factory.setReadTimeout(Duration.ofSeconds(3));
        this.client = RestClient.builder().baseUrl(config.url()).requestFactory(factory).build();
        this.internalKey = config.internalApiKey() == null ? "" : config.internalApiKey();
    }

    @Override
    public VerifiedApiKey verify(String presentedKey) {
        if (internalKey.isBlank()) {
            throw new ApiKeyServiceUnavailableException("no internal API key is configured");
        }
        Response r;
        try {
            r = client.post()
                    .uri(VERIFY_PATH)
                    .header(INTERNAL_KEY_HEADER, internalKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("key", presentedKey))
                    .retrieve()
                    .body(Response.class);
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() == 401) {
                throw new InvalidApiKeyException();
            }
            throw new ApiKeyServiceUnavailableException("platform service answered " + e.getStatusCode().value());
        } catch (RestClientException e) {
            throw new ApiKeyServiceUnavailableException(e.getClass().getSimpleName());
        }
        if (r == null || r.keyId() == null || r.appId() == null || r.ownerUid() == null) {
            throw new ApiKeyServiceUnavailableException("unreadable verification answer");
        }
        return new VerifiedApiKey(r.keyId(), r.appId(), r.ownerUid(), r.scopes(), r.permissions());
    }
}
