package com.personalplatform.homepulse.simulation;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Owner-authenticated like the other appliance endpoints: someone else's appliance id is a 404. */
@RestController
public class SimulationController {

    /** Both fields optional: 7 days of NORMAL by default. */
    public record StartRequest(@Min(1) @Max(14) Integer days, SimulationScenario scenario) {}

    public record StartResponse(int readingsInserted, String baselineStatus, boolean alertOpened) {}

    private final SimulationService service;

    public SimulationController(SimulationService service) {
        this.service = service;
    }

    @PostMapping("/v1/appliances/{applianceId}/simulation")
    StartResponse start(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID applianceId,
                        @Valid @RequestBody(required = false) StartRequest body) {
        int days = body == null || body.days() == null ? 7 : body.days();
        SimulationScenario scenario = body == null || body.scenario() == null ? SimulationScenario.NORMAL : body.scenario();
        var r = service.start(jwt.getSubject(), applianceId, days, scenario);
        return new StartResponse(r.readingsInserted(), r.baselineStatus(), r.alertOpened());
    }

    @DeleteMapping("/v1/appliances/{applianceId}/simulation")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void stop(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID applianceId) {
        service.stop(jwt.getSubject(), applianceId);
    }
}
