package com.personalplatform.homepulse.alert;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AlertController {

    private final AlertService service;
    private final Clock clock;

    public AlertController(AlertService service, Clock clock) {
        this.service = service;
        this.clock = clock;
    }

    /** Live alerts by default; {@code status} filters exactly, {@code includeResolved=true} adds history. */
    @GetMapping("/v1/alerts")
    List<AlertResponse> list(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) AlertStatus status,
            @RequestParam(required = false) UUID applianceId,
            @RequestParam(defaultValue = "false") boolean includeResolved,
            @RequestParam(defaultValue = "100") int limit) {
        LocalDate today = today();
        return service.list(jwt.getSubject(), status, applianceId, includeResolved, limit).stream()
                .map(a -> AlertResponse.from(a, today)).toList();
    }

    @GetMapping("/v1/alerts/{id}")
    AlertResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return AlertResponse.from(service.get(jwt.getSubject(), id), today());
    }

    @PostMapping("/v1/alerts/{id}/ack")
    AlertResponse acknowledge(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return AlertResponse.from(service.acknowledge(jwt.getSubject(), id), today());
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(ZoneOffset.UTC));
    }
}
