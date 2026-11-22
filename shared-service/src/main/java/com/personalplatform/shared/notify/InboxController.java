package com.personalplatform.shared.notify;

import com.personalplatform.shared.notify.InboxService.NotificationView;
import com.personalplatform.shared.notify.InboxService.UnreadCount;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The caller's own in-app notifications. Exposed through the gateway as /api/shared/v1/notifications. */
@RestController
@RequestMapping("/v1/notifications")
public class InboxController {

    private final InboxService inbox;

    public InboxController(InboxService inbox) {
        this.inbox = inbox;
    }

    @GetMapping
    public List<NotificationView> list(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) String status) {
        return inbox.list(jwt.getSubject(), status);
    }

    @GetMapping("/unread-count")
    public UnreadCount unreadCount(@AuthenticationPrincipal Jwt jwt) {
        return inbox.unreadCount(jwt.getSubject());
    }

    @PostMapping("/{id}/read")
    public NotificationView markRead(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return inbox.markRead(jwt.getSubject(), id);
    }

    @PostMapping("/read-all")
    public Map<String, Long> markAllRead(@AuthenticationPrincipal Jwt jwt) {
        return Map.of("updated", inbox.markAllRead(jwt.getSubject()));
    }
}
