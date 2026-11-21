package com.personalplatform.consent.consent;

import com.personalplatform.consent.client.ClientRecord;
import com.personalplatform.consent.client.ClientService;
import com.personalplatform.consent.token.TokenService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Client-facing consent endpoints. Require a gateway CLIENT token (see /v1/oauth/token). */
@RestController
@RequestMapping("/v1/gateway")
public class GatewayRequestController {

    public record CreateRequest(
            @NotEmpty @Size(max = 50) List<@NotBlank @Size(max = 270) String> scopes,
            @NotBlank @Size(max = 500) String purpose,
            @Min(60) @Max(31_536_000) long durationSeconds,
            @Min(1) Integer maxReads,
            @Valid AllowedHours allowedHours) {}

    private final ConsentService consent;
    private final ClientService clients;
    private final Clock clock;

    public GatewayRequestController(ConsentService consent, ClientService clients, Clock clock) {
        this.consent = consent;
        this.clients = clients;
        this.clock = clock;
    }

    @PostMapping("/requests")
    public ResponseEntity<ConsentViews.RequestView> create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateRequest body) {
        ClientRecord client = clients.requireActive(jwt.getSubject());
        AccessRequestRow row = consent.createRequest(client, new ConsentService.NewRequest(
                body.scopes(), body.purpose(), body.durationSeconds(), body.maxReads(),
                body.allowedHours() == null ? null : body.allowedHours().toWindow()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ConsentViews.RequestView.of(row, false, null));
    }

    /** Poll for the owner's decision; once approved, {@code grantId} is what you exchange for an access token. */
    @GetMapping("/requests/{id}")
    public ConsentViews.RequestView get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        ClientRecord client = clients.requireActive(jwt.getSubject());
        AccessRequestRow row = consent.requestForClient(client, id);
        return ConsentViews.RequestView.of(row, consent.isExpired(row), consent.grantIdForRequest(id).orElse(null));
    }

    @PostMapping("/grants/{grantId}/token")
    public ResponseEntity<Map<String, Object>> exchange(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID grantId) {
        ClientRecord client = clients.requireActive(jwt.getSubject());
        TokenService.IssuedToken t = consent.issueAccessToken(client, grantId);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("access_token", t.token());
        body.put("token_type", "Bearer");
        body.put("expires_in", t.expiresInSeconds(clock.instant()));
        body.put("scope", t.scope());
        body.put("grant_id", grantId.toString());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
