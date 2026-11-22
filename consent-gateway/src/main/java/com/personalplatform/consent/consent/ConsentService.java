package com.personalplatform.consent.consent;

import com.personalplatform.consent.audit.AuditEvent;
import com.personalplatform.consent.audit.AuditService;
import com.personalplatform.consent.client.ClientRecord;
import com.personalplatform.consent.client.ClientRepository;
import com.personalplatform.consent.client.ClientService;
import com.personalplatform.consent.common.ApiException;
import com.personalplatform.consent.config.ConsentProperties;
import com.personalplatform.consent.policy.Scope;
import com.personalplatform.consent.policy.Sensitivity;
import com.personalplatform.consent.policy.TimeWindow;
import com.personalplatform.consent.token.TokenService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The consent flow: client asks, owner decides, client exchanges the grant for a short-lived token. */
@Service
public class ConsentService {

    static final int MIN_DURATION_SECONDS = 60;
    static final int MAX_PENDING_PER_CLIENT = 50;

    /** What a client asks for. */
    public record NewRequest(List<String> scopes, String purpose, long durationSeconds, Integer maxReads, TimeWindow window) {}

    /** What the owner approves; every null means "as requested". Can only narrow, never broaden. */
    public record Approval(List<String> scopes, Long durationSeconds, Integer maxReads, Sensitivity maxSensitivity, TimeWindow window) {}

    private final AccessRequestRepository requests;
    private final GrantRepository grants;
    private final ClientRepository clients;
    private final TokenService tokens;
    private final AuditService audit;
    private final ConsentProperties props;
    private final Clock clock;

    public ConsentService(
            AccessRequestRepository requests,
            GrantRepository grants,
            ClientRepository clients,
            TokenService tokens,
            AuditService audit,
            ConsentProperties props,
            Clock clock) {
        this.requests = requests;
        this.grants = grants;
        this.clients = clients;
        this.tokens = tokens;
        this.audit = audit;
        this.props = props;
        this.clock = clock;
    }

    // ---- client side ----

    @Transactional
    public AccessRequestRow createRequest(ClientRecord client, NewRequest req) {
        List<String> scopes = ClientService.canonicalScopes(req.scopes());
        for (String s : scopes) {
            if (!client.mayRequest(Scope.parse(s))) {
                throw new ApiException(HttpStatus.FORBIDDEN, "SCOPE_NOT_ALLOWED_FOR_CLIENT",
                        "Client is not registered for scope " + s);
            }
        }
        if (req.purpose() == null || req.purpose().isBlank()) {
            throw ApiException.badRequest("purpose is required");
        }
        if (req.durationSeconds() < MIN_DURATION_SECONDS || req.durationSeconds() > props.maxGrantDuration().toSeconds()) {
            throw ApiException.badRequest("durationSeconds must be between " + MIN_DURATION_SECONDS + " and "
                    + props.maxGrantDuration().toSeconds());
        }
        if (req.maxReads() != null && req.maxReads() < 1) {
            throw ApiException.badRequest("maxReads must be at least 1");
        }
        if (requests.countPending(client.pk()) >= MAX_PENDING_PER_CLIENT) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_PENDING_REQUESTS",
                    "Too many pending requests; wait for the owner to decide");
        }
        UUID id = requests.insert(client.ownerUid(), client.pk(), scopes, req.purpose().trim(),
                (int) req.durationSeconds(), req.maxReads(), req.window(), now());
        audit.append(client.ownerUid(), AuditEvent.ACCESS_REQUESTED, "CLIENT", client.clientId(), client.clientId(), null,
                Map.of("requestId", id.toString(), "scopes", scopes, "purpose", req.purpose().trim(),
                        "durationSeconds", req.durationSeconds()));
        return requests.findForClient(client.pk(), id).orElseThrow();
    }

    @Transactional(readOnly = true)
    public AccessRequestRow requestForClient(ClientRecord client, UUID id) {
        return requests.findForClient(client.pk(), id).orElseThrow(() -> ApiException.notFound("Request"));
    }

    @Transactional(readOnly = true)
    public Optional<UUID> grantIdForRequest(UUID requestId) {
        return requests.grantIdForRequest(requestId);
    }

    /** Exchange an approved grant for a short-lived access token. Refused for revoked or expired grants. */
    @Transactional
    public TokenService.IssuedToken issueAccessToken(ClientRecord client, UUID grantId) {
        GrantRow grant = grants.find(grantId)
                .filter(g -> g.clientPk().equals(client.pk()))
                .orElseThrow(() -> ApiException.notFound("Grant"));
        Instant now = clock.instant();
        switch (grant.status(now)) {
            case "REVOKED" -> throw new ApiException(HttpStatus.FORBIDDEN, "GRANT_REVOKED", "Grant was revoked");
            case "EXPIRED" -> throw new ApiException(HttpStatus.FORBIDDEN, "GRANT_EXPIRED", "Grant expired");
            default -> { }
        }
        TokenService.IssuedToken token = tokens.issueAccessToken(client, grant);
        audit.append(grant.ownerUid(), AuditEvent.TOKEN_ISSUED, "CLIENT", client.clientId(), client.clientId(), grantId,
                Map.of("jti", token.jti().toString(), "expiresAt", token.expiresAt().toString()));
        return token;
    }

    // ---- owner side ----

    @Transactional(readOnly = true)
    public List<AccessRequestRow> listRequests(String owner, String status) {
        if (status != null && !List.of("PENDING", "APPROVED", "DENIED").contains(status)) {
            throw ApiException.badRequest("status must be PENDING, APPROVED or DENIED");
        }
        return requests.listForOwner(owner, status);
    }

    @Transactional(readOnly = true)
    public AccessRequestRow getRequest(String owner, UUID id) {
        return requests.findForOwner(owner, id).orElseThrow(() -> ApiException.notFound("Request"));
    }

    /** A pending request older than {@code request-ttl} can no longer be approved. */
    public boolean isExpired(AccessRequestRow r) {
        return "PENDING".equals(r.status()) && !clock.instant().isBefore(r.createdAt().plus(props.requestTtl()));
    }

    @Transactional
    public GrantRow approve(String owner, UUID requestId, Approval approval) {
        AccessRequestRow req = getRequest(owner, requestId);
        if (!"PENDING".equals(req.status())) {
            throw ApiException.conflict("REQUEST_ALREADY_DECIDED", "Request was already " + req.status());
        }
        if (isExpired(req)) {
            throw ApiException.conflict("REQUEST_EXPIRED", "Request expired before it was decided");
        }
        ClientRecord client = clients.findByClientId(req.clientId()).orElseThrow();
        if (!client.isActive()) {
            throw ApiException.conflict("CLIENT_DISABLED", "Client is disabled");
        }

        List<String> approvedScopes = req.scopes();
        if (approval.scopes() != null) {
            approvedScopes = ClientService.canonicalScopes(approval.scopes());
            for (String s : approvedScopes) {
                Scope approved = Scope.parse(s);
                if (req.scopes().stream().map(Scope::parse).noneMatch(r -> r.covers(approved))) {
                    throw ApiException.badRequest("Scope " + s + " is broader than what was requested; approval can only narrow");
                }
            }
        }
        long duration = req.durationSeconds();
        if (approval.durationSeconds() != null) {
            if (approval.durationSeconds() < MIN_DURATION_SECONDS || approval.durationSeconds() > req.durationSeconds()) {
                throw ApiException.badRequest("durationSeconds must be between " + MIN_DURATION_SECONDS
                        + " and the requested " + req.durationSeconds());
            }
            duration = approval.durationSeconds();
        }
        Integer maxReads = req.maxReads();
        if (approval.maxReads() != null) {
            if (approval.maxReads() < 1 || (req.maxReads() != null && approval.maxReads() > req.maxReads())) {
                throw ApiException.badRequest("maxReads must be at least 1 and not above the requested value");
            }
            maxReads = approval.maxReads();
        }
        TimeWindow window = approval.window() == null ? req.window() : narrowWindow(req.window(), approval.window());
        Sensitivity ceiling = approval.maxSensitivity() != null ? approval.maxSensitivity() : Sensitivity.SENSITIVE;

        OffsetDateTime now = now();
        if (!requests.decide(owner, requestId, "APPROVED", null, now)) {
            throw ApiException.conflict("REQUEST_ALREADY_DECIDED", "Request was already decided");
        }
        UUID grantId = grants.insert(requestId, owner, req.clientPk(), approvedScopes, req.purpose(), ceiling, now,
                now.plus(Duration.ofSeconds(duration)), maxReads, window);
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("requestId", requestId.toString());
        detail.put("scopes", approvedScopes);
        detail.put("narrowed", !approvedScopes.equals(req.scopes()) || duration != req.durationSeconds());
        detail.put("expiresAt", now.plus(Duration.ofSeconds(duration)).toInstant().toString());
        detail.put("maxReads", maxReads);
        detail.put("maxSensitivity", ceiling.name());
        audit.append(owner, AuditEvent.REQUEST_APPROVED, "OWNER", owner, req.clientId(), grantId, detail);
        return grants.find(grantId).orElseThrow();
    }

    /**
     * The owner may narrow the requested hours, never widen them. If the client asked for no particular hours, any
     * window is a narrowing. Otherwise the approved window must use the requested zone and allow only hours the client
     * asked for.
     */
    static TimeWindow narrowWindow(TimeWindow requested, TimeWindow approved) {
        if (requested == null) {
            return approved;
        }
        if (!requested.zone().equals(approved.zone())) {
            throw ApiException.badRequest("Approved hours must use the requested time zone " + requested.zone());
        }
        for (int hour = 0; hour < 24; hour++) {
            if (approved.containsHour(hour) && !requested.containsHour(hour)) {
                throw ApiException.badRequest("Approval can only narrow the requested hours; hour " + hour
                        + " was not requested");
            }
        }
        return approved;
    }

    @Transactional
    public AccessRequestRow deny(String owner, UUID requestId, String note) {
        AccessRequestRow req = getRequest(owner, requestId);
        if (!requests.decide(owner, requestId, "DENIED", note, now())) {
            throw ApiException.conflict("REQUEST_ALREADY_DECIDED", "Request was already " + req.status());
        }
        audit.append(owner, AuditEvent.REQUEST_DENIED, "OWNER", owner, req.clientId(), null,
                Map.of("requestId", requestId.toString()));
        return getRequest(owner, requestId);
    }

    @Transactional(readOnly = true)
    public List<GrantRow> listGrants(String owner, boolean includeInactive) {
        return grants.listForOwner(owner, !includeInactive, clock.instant());
    }

    /** Immediate: the very next read re-checks the grant row and is denied. Idempotent. */
    @Transactional
    public GrantRow revokeGrant(String owner, UUID grantId) {
        GrantRow g = grants.findForOwner(owner, grantId).orElseThrow(() -> ApiException.notFound("Grant"));
        if (grants.revoke(grantId, now())) {
            audit.append(owner, AuditEvent.GRANT_REVOKED, "OWNER", owner, g.clientId(), grantId, Map.of("cause", "OWNER"));
        }
        return grants.find(grantId).orElseThrow();
    }

    private OffsetDateTime now() {
        return clock.instant().atOffset(ZoneOffset.UTC);
    }
}
