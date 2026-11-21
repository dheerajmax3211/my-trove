package com.personalplatform.auth.admin;

import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/admin/audit")
public class AdminAuditController {

    private final AuditRepository audit;

    public AdminAuditController(AuditRepository audit) {
        this.audit = audit;
    }

    /** Newest first. {@code targetId} restricts the trail to one user. */
    @GetMapping
    @PreAuthorize("hasAuthority('audit:read')")
    public PageResponse<AuditRepository.Entry> list(
            @RequestParam(required = false) UUID targetId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Paging.validate(page, size);
        AuditRepository.Page result = audit.list(targetId, page, size);
        return new PageResponse<>(result.items(), page, size, result.total());
    }
}
