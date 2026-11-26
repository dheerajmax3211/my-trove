package com.personalplatform.homepulse.ml;

import com.personalplatform.homepulse.detect.ApplianceType;
import com.personalplatform.homepulse.detect.MinuteSample;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * HTTP client of ml-service. Scoring uses a short timeout (it runs inside the evaluation of every appliance);
 * training, which ships a week of minute samples, gets a longer one. No credentials: ml-service is reachable only
 * from home-pulse (Kubernetes NetworkPolicy, compose network).
 */
public class MlServiceClient implements MlClient {

    private final RestClient scoring;
    private final RestClient training;

    public MlServiceClient(String baseUrl, Duration timeout, Duration trainTimeout) {
        this.scoring = client(baseUrl, timeout, timeout);
        this.training = client(baseUrl, timeout, trainTimeout);
    }

    private static RestClient client(String baseUrl, Duration connect, Duration read) {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(connect).version(HttpClient.Version.HTTP_1_1).build());
        factory.setReadTimeout(read);
        return RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
    }

    @Override
    public ScoreOutcome score(UUID applianceId, Instant windowStart, List<MinuteSample> samples, Instant now,
                              Set<String> liveFeatures) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("samples", wire(samples));
        body.put("now", now.toString());
        body.put("window_start", windowStart.toString());
        body.put("live_features", liveFeatures.stream().sorted().toList());
        try {
            ScoreResponse r = scoring.post()
                    .uri("/v1/models/{id}/score", applianceId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(ScoreResponse.class);
            if (r == null || !"ok".equals(r.status())) {
                throw new MlServiceException("unreadable score answer");
            }
            return new ScoreOutcome.Scored(r);
        } catch (RestClientResponseException e) {
            return switch (e.getStatusCode().value()) {
                case 404 -> new ScoreOutcome.Untrained();
                case 409 -> new ScoreOutcome.Stale();
                default -> throw new MlServiceException("score answered " + e.getStatusCode().value(), e);
            };
        } catch (RestClientException e) {
            throw new MlServiceException("score failed: " + e.getClass().getSimpleName(), e);
        }
    }

    @Override
    public void train(UUID applianceId, ApplianceType type, Instant windowStart, Instant windowEnd,
                      List<MinuteSample> samples) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("appliance_type", type.name());
        body.put("window_start", windowStart.toString());
        body.put("window_end", windowEnd.toString());
        body.put("samples", wire(samples));
        try {
            training.post()
                    .uri("/v1/models/{id}/train", applianceId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException e) {
            throw new MlServiceException("train answered " + e.getStatusCode().value(), e);
        } catch (RestClientException e) {
            throw new MlServiceException("train failed: " + e.getClass().getSimpleName(), e);
        }
    }

    private static List<Map<String, Object>> wire(List<MinuteSample> samples) {
        return samples.stream().map(s -> Map.<String, Object>of("ts", s.ts().toString(), "watts", s.watts())).toList();
    }
}
