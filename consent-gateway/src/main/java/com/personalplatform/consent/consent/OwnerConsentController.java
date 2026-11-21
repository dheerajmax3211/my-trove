package com.personalplatform.consent.consent;

import com.personalplatform.consent.audit.AuditEntry;
import com.personalplatform.consent.audit.AuditService;
import com.personalplatform.consent.policy.Sensitivity;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Owner-facing consent endpoints (Firebase-authenticated): decide on requests, see and revoke access. */
@RestController
@RequestMapping("/v1/owner")
public class OwnerConsentController {

    public record ApproveBody(
            List<@Size(max = 270) String> scopes,
            @Min(60) @Max(31_536_000) Long durationSeconds,
            @Min(1) Integer maxReads,
            Sensitivity maxSensitivity,
            @Valid AllowedHours allowedHours) {}

    public record DenyBody(@Size(max = 500) String note) {}

    public record Dashboard(long pendingRequests, List<ConsentViews.GrantView> activeGrants, List<AuditEntry> recentAccess) {}

    private final ConsentService consent;
    private final AuditService audit;
    private final Clock clock;

    public OwnerConsentController(ConsentService consent, AuditService audit, Clock clock) {
        this.consent = consent;
        this.audit = audit;
        this.clock = clock;
    }

    @GetMapping("/requests")
    public List<ConsentViews.RequestView> requests(
            @AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) String status) {
        return consent.listRequests(jwt.getSubject(), status).stream().map(this::view).toList();
    }

    @GetMapping("/requests/{id}")
    public ConsentViews.RequestView request(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return view(consent.getRequest(jwt.getSubject(), id));
    }

    @PostMapping("/requests/{id}/approve")
    public ConsentViews.GrantView approve(
            @AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody(required = false) ApproveBody body) {
        ApproveBody b = body == null ? new ApproveBody(null, null, null, null, null) : body;
        GrantRow g = consent.approve(jwt.getSubject(), id, new ConsentService.Approval(
                b.scopes(), b.durationSeconds(), b.maxReads(), b.maxSensitivity(),
                b.allowedHours() == null ? null : b.allowedHours().toWindow()));
        return ConsentViews.GrantView.of(g, clock.instant());
    }

    @PostMapping("/requests/{id}/deny")
    public ConsentViews.RequestView deny(
            @AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody(required = false) DenyBody body) {
        return view(consent.deny(jwt.getSubject(), id, body == null ? null : body.note()));
    }

    /** Who has access to what. Active grants by default. */
    @GetMapping("/grants")
    public List<ConsentViews.GrantView> grants(
            @AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "false") boolean includeInactive) {
        Instant now = clock.instant();
        return consent.listGrants(jwt.getSubject(), includeInactive).stream()
                .map(g -> ConsentViews.GrantView.of(g, now))
                .toList();
    }

    @PostMapping("/grants/{id}/revoke")
    public ConsentViews.GrantView revoke(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return ConsentViews.GrantView.of(consent.revokeGrant(jwt.getSubject(), id), clock.instant());
    }

    @GetMapping("/dashboard")
    public Dashboard dashboard(@AuthenticationPrincipal Jwt jwt) {
        String owner = jwt.getSubject();
        Instant now = clock.instant();
        long pending = consent.listRequests(owner, "PENDING").stream().filter(r -> !consent.isExpired(r)).count();
        return new Dashboard(
                pending,
                consent.listGrants(owner, false).stream().map(g -> ConsentViews.GrantView.of(g, now)).toList(),
                audit.history(owner, 10, null, null));
    }

    private ConsentViews.RequestView view(AccessRequestRow r) {
        return ConsentViews.RequestView.of(r, consent.isExpired(r), consent.grantIdForRequest(r.id()).orElse(null));
    }
}
