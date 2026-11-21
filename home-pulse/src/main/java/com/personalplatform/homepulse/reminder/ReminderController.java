package com.personalplatform.homepulse.reminder;

import com.personalplatform.homepulse.alert.Alert;
import com.personalplatform.homepulse.alert.AlertService;
import com.personalplatform.homepulse.appliance.ApplianceService;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ReminderController {

    private final ApplianceService appliances;
    private final AlertService alerts;
    private final Clock clock;

    public ReminderController(ApplianceService appliances, AlertService alerts, Clock clock) {
        this.appliances = appliances;
        this.alerts = alerts;
        this.clock = clock;
    }

    /** Upcoming and overdue service dates and warranty ends within {@code days} (default 60, max 365). */
    @GetMapping("/v1/reminders")
    List<Reminder> reminders(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "60") int days) {
        if (days < 0 || days > 365) {
            throw new IllegalArgumentException("days must be between 0 and 365");
        }
        String owner = jwt.getSubject();
        Set<UUID> alerting = alerts.list(owner, null, null, false, 500).stream()
                .map(Alert::applianceId).collect(Collectors.toSet());
        return ReminderCalculator.compute(appliances.list(owner), alerting,
                LocalDate.now(clock.withZone(ZoneOffset.UTC)), days);
    }
}
