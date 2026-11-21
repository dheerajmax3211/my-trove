package com.personalplatform.treasury.config;

import com.personalplatform.treasury.allowance.AllowanceService;
import com.personalplatform.treasury.approval.ApprovalService;
import com.personalplatform.treasury.report.ReconciliationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Background jobs; safe on several instances (allowance claiming is SKIP LOCKED, the others are idempotent/read-only). */
@Component
@ConditionalOnProperty(name = "treasury.scheduler.enabled", havingValue = "true", matchIfMissing = true)
public class TreasuryScheduler {

    private static final Logger log = LoggerFactory.getLogger(TreasuryScheduler.class);

    private final AllowanceService allowances;
    private final ApprovalService approvals;
    private final ReconciliationService reconciliation;

    public TreasuryScheduler(AllowanceService allowances, ApprovalService approvals, ReconciliationService reconciliation) {
        this.allowances = allowances;
        this.approvals = approvals;
        this.reconciliation = reconciliation;
    }

    @Scheduled(fixedDelayString = "${treasury.scheduler.allowance-delay}", initialDelayString = "${treasury.scheduler.allowance-delay}")
    void payAllowances() {
        var summary = allowances.runDue();
        if (summary.paid() + summary.skipped() + summary.failed() > 0) {
            log.info("allowance run: {}", summary);
        }
    }

    @Scheduled(fixedDelayString = "${treasury.scheduler.expiry-delay}", initialDelayString = "${treasury.scheduler.expiry-delay}")
    void expireApprovals() {
        approvals.expireDue();
    }

    @Scheduled(fixedDelayString = "${treasury.scheduler.reconciliation-delay}", initialDelayString = "${treasury.scheduler.reconciliation-delay}")
    void reconcile() {
        reconciliation.reconcileAll();
    }
}
