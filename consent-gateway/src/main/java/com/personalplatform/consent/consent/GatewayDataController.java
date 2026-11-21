package com.personalplatform.consent.consent;

import com.personalplatform.consent.common.ApiException;
import com.personalplatform.consent.policy.Sensitivity;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** Read endpoint for third parties. Requires a gateway ACCESS token; releases only what the live grant covers. */
@RestController
@RequestMapping("/v1/gateway")
public class GatewayDataController {

    public record DataAttribute(String key, JsonNode value, Sensitivity sensitivity) {}

    public record DataResponse(UUID grantId, List<DataAttribute> attributes, Integer readsRemaining, Instant grantExpiresAt) {}

    private final GatewayDataService data;

    public GatewayDataController(GatewayDataService data) {
        this.data = data;
    }

    /**
     * @param path optional attribute path or prefix; omitted = everything the grant covers
     * @param purpose optional; if given it must equal the approved purpose
     */
    @GetMapping("/data")
    public ResponseEntity<?> read(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) String path,
            @RequestParam(required = false) String purpose) {
        UUID grantId;
        try {
            grantId = UUID.fromString(jwt.getClaimAsString("grant_id"));
        } catch (IllegalArgumentException | NullPointerException e) {
            throw ApiException.badRequest("access token carries no grant");
        }
        GatewayDataService.ReadOutcome out = data.read(jwt.getSubject(), grantId, path, purpose);
        if (!out.decision().isAllowed()) {
            ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, out.decision().message());
            pd.setProperty("code", "ACCESS_DENIED");
            pd.setProperty("decision", out.decision().effect().name());
            pd.setProperty("reason", out.decision().reason().name());
            return ResponseEntity.status(HttpStatus.FORBIDDEN).cacheControl(CacheControl.noStore()).body(pd);
        }
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new DataResponse(
                        out.grantId(),
                        out.attributes().stream()
                                .map(a -> new DataAttribute(a.keyPath(), a.value(), a.sensitivity()))
                                .toList(),
                        out.readsRemaining(),
                        out.grantExpiresAt()));
    }
}
