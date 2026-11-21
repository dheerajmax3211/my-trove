package com.personalplatform.treasury.web;

import com.personalplatform.treasury.report.ReconciliationService;
import com.personalplatform.treasury.report.ReconciliationService.Report;
import com.personalplatform.treasury.report.StatementService;
import com.personalplatform.treasury.report.StatementService.Statement;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/households/{householdId}")
public class ReportController {

    private final StatementService statements;
    private final ReconciliationService reconciliation;

    public ReportController(StatementService statements, ReconciliationService reconciliation) {
        this.statements = statements;
        this.reconciliation = reconciliation;
    }

    /** Paged statement with running balance. {@code from} inclusive, {@code to} exclusive (ISO-8601 instants). */
    @GetMapping("/accounts/{accountId}/statement")
    public Statement statement(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId, @PathVariable UUID accountId,
                               @RequestParam(required = false) Instant from, @RequestParam(required = false) Instant to,
                               @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
        return statements.statement(jwt.getSubject(), householdId, accountId, from, to, page, size);
    }

    @GetMapping(value = "/accounts/{accountId}/statement.csv", produces = "text/csv")
    public ResponseEntity<String> statementCsv(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId,
                                               @PathVariable UUID accountId, @RequestParam(required = false) Instant from,
                                               @RequestParam(required = false) Instant to) {
        String csv = statements.csv(jwt.getSubject(), householdId, accountId, from, to);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"statement-" + accountId + ".csv\"")
                .body(csv);
    }

    /** Compares the balance projection with SUM(postings) for every account and reports drift. */
    @GetMapping("/reconciliation")
    public Report reconcile(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId) {
        return reconciliation.reconcile(jwt.getSubject(), householdId);
    }
}
