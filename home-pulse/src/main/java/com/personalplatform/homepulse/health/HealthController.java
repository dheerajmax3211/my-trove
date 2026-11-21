package com.personalplatform.homepulse.health;

import com.personalplatform.homepulse.alert.RelearnService;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

    private final HealthService health;
    private final RelearnService relearn;

    public HealthController(HealthService health, RelearnService relearn) {
        this.health = health;
        this.relearn = relearn;
    }

    @GetMapping("/v1/appliances/{applianceId}/health")
    ApplianceHealth health(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID applianceId) {
        return health.health(jwt.getSubject(), applianceId);
    }

    /** Use after a repair/service: discards the learned baseline and learns "normal" again from now. */
    @PostMapping("/v1/appliances/{applianceId}/baseline/relearn")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void relearn(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID applianceId) {
        relearn.relearn(jwt.getSubject(), applianceId);
    }
}
