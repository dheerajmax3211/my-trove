package com.personalplatform.homepulse.appliance;

import jakarta.validation.Valid;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ApplianceController {

    private final ApplianceService service;
    private final Clock clock;

    public ApplianceController(ApplianceService service, Clock clock) {
        this.service = service;
        this.clock = clock;
    }

    @PostMapping("/v1/appliances")
    @ResponseStatus(HttpStatus.CREATED)
    ApplianceResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ApplianceRequest body) {
        return view(service.create(jwt.getSubject(), body));
    }

    @GetMapping("/v1/appliances")
    List<ApplianceResponse> list(@AuthenticationPrincipal Jwt jwt) {
        return service.list(jwt.getSubject()).stream().map(this::view).toList();
    }

    @GetMapping("/v1/appliances/{id}")
    ApplianceResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return view(service.get(jwt.getSubject(), id));
    }

    @PutMapping("/v1/appliances/{id}")
    ApplianceResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                             @Valid @RequestBody ApplianceRequest body) {
        return view(service.update(jwt.getSubject(), id, body));
    }

    @DeleteMapping("/v1/appliances/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        service.delete(jwt.getSubject(), id);
    }

    private ApplianceResponse view(Appliance a) {
        return ApplianceResponse.from(a, LocalDate.now(clock.withZone(ZoneOffset.UTC)));
    }
}
