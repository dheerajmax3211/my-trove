package com.personalplatform.treasury.web;

import com.personalplatform.treasury.allowance.AllowanceDtos.CreateScheduleRequest;
import com.personalplatform.treasury.allowance.AllowanceDtos.ScheduleView;
import com.personalplatform.treasury.allowance.AllowanceService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/households/{householdId}/allowance-schedules")
public class AllowanceController {

    private final AllowanceService allowances;

    public AllowanceController(AllowanceService allowances) {
        this.allowances = allowances;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ScheduleView create(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId,
                               @Valid @RequestBody CreateScheduleRequest req) {
        return allowances.create(jwt.getSubject(), householdId, req);
    }

    @GetMapping
    public List<ScheduleView> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId) {
        return allowances.list(jwt.getSubject(), householdId);
    }

    @GetMapping("/{scheduleId}/runs")
    public List<String> runs(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId, @PathVariable UUID scheduleId) {
        return allowances.runLog(jwt.getSubject(), householdId, scheduleId);
    }

    @DeleteMapping("/{scheduleId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deactivate(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId, @PathVariable UUID scheduleId) {
        allowances.deactivate(jwt.getSubject(), householdId, scheduleId);
    }
}
