package com.personalplatform.platform.plans;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * What the gateway reads to enforce plans. Authenticated by {@code X-Internal-Key} (see SecurityConfig), never by a
 * user token, and never meant to be reachable from the internet: the gateway must not route {@code /internal/**}.
 */
@RestController
@RequestMapping("/internal/v1")
class PlanController {

    private final QuotaService quotas;

    PlanController(QuotaService quotas) {
        this.quotas = quotas;
    }

    /** {@code [{plan, requestsPerMinute, requestsPerMonth, maxApiKeys, maxWebhooks}]} */
    @GetMapping("/plans")
    List<QuotaService.Plan> plans() {
        return quotas.plans();
    }

    /**
     * {@code {plan, monthlyLimit, used}} for the current UTC month. The optional {@code plan} parameter is the plan
     * from the caller's token and wins over the plan inferred from the principal's last event.
     */
    @GetMapping("/quota/{principalId}")
    QuotaService.Quota quota(@PathVariable String principalId, @RequestParam(required = false) String plan) {
        return quotas.quota(principalId, plan);
    }
}
