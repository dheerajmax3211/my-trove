package com.personalplatform.shared.audit;

import com.personalplatform.shared.common.Page;
import com.personalplatform.shared.household.HouseholdAccess;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/audit")
public class AuditController {

    private final AuditService audit;
    private final HouseholdAccess access;

    public AuditController(AuditService audit, HouseholdAccess access) {
        this.audit = audit;
        this.access = access;
    }

    /**
     * With {@code householdId}: that household's feed (any member may read). Without: the caller's own personal
     * events. Newest first.
     */
    @GetMapping
    public Page<AuditService.AuditEvent> list(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) UUID householdId,
            @RequestParam(required = false) String action,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        if (householdId != null) {
            access.requireMember(jwt.getSubject(), householdId);
        }
        return audit.list(jwt.getSubject(), householdId, action, Math.max(page, 0), Math.min(Math.max(size, 1), 200));
    }
}
