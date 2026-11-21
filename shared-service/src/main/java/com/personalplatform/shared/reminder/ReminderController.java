package com.personalplatform.shared.reminder;

import com.personalplatform.shared.reminder.ReminderService.NotificationView;
import com.personalplatform.shared.reminder.ReminderService.ReminderView;
import com.personalplatform.shared.reminder.ReminderService.Status;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
public class ReminderController {

    public record RecurrenceRequest(@NotNull Recurrence.Unit unit, @Min(1) @Max(365) Integer interval) {
        Recurrence toRecurrence() {
            return new Recurrence(unit, interval == null ? 1 : interval);
        }
    }

    public record CreateReminderRequest(@NotBlank @Size(max = 300) String title, @NotNull Instant dueAt,
            @Valid RecurrenceRequest recurrence, UUID householdId) {}

    public record UpdateReminderRequest(@NotBlank @Size(max = 300) String title, @NotNull Instant dueAt,
            @Valid RecurrenceRequest recurrence) {}

    private final ReminderService reminders;

    public ReminderController(ReminderService reminders) {
        this.reminders = reminders;
    }

    @PostMapping("/reminders")
    @ResponseStatus(HttpStatus.CREATED)
    public ReminderView create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateReminderRequest req) {
        return reminders.create(jwt.getSubject(), req.title(), req.dueAt(),
                req.recurrence() == null ? null : req.recurrence().toRecurrence(), req.householdId());
    }

    @GetMapping("/reminders")
    public List<ReminderView> list(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) UUID householdId,
            @RequestParam(required = false) Status status) {
        return reminders.list(jwt.getSubject(), householdId, status);
    }

    @GetMapping("/reminders/{id}")
    public ReminderView get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return reminders.get(jwt.getSubject(), id);
    }

    @PutMapping("/reminders/{id}")
    public ReminderView update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @Valid @RequestBody UpdateReminderRequest req) {
        return reminders.update(jwt.getSubject(), id, req.title(), req.dueAt(),
                req.recurrence() == null ? null : req.recurrence().toRecurrence());
    }

    @PostMapping("/reminders/{id}/cancel")
    public ReminderView cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return reminders.cancel(jwt.getSubject(), id);
    }

    @GetMapping("/notifications")
    public List<NotificationView> notifications(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) String status) {
        return reminders.notifications(jwt.getSubject(), status);
    }
}
