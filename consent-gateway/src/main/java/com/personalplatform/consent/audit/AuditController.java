package com.personalplatform.consent.audit;

import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Owner-only: who touched my data, and has the log been tampered with? */
@RestController
@RequestMapping("/v1/owner")
public class AuditController {

    private final AuditService audit;

    public AuditController(AuditService audit) {
        this.audit = audit;
    }

    @GetMapping("/access-log")
    public List<AuditEntry> accessLog(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(required = false) Long beforeSeq,
            @RequestParam(required = false) String clientId) {
        return audit.history(jwt.getSubject(), limit, beforeSeq, clientId);
    }

    @GetMapping("/audit/verify")
    public ChainReport verify(@AuthenticationPrincipal Jwt jwt) {
        return audit.verify(jwt.getSubject());
    }
}
