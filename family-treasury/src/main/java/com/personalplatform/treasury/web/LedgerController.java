package com.personalplatform.treasury.web;

import com.personalplatform.treasury.approval.ApprovalService;
import com.personalplatform.treasury.approval.ApprovalView;
import com.personalplatform.treasury.ledger.EntryView;
import com.personalplatform.treasury.ops.OpsDtos.DepositRequest;
import com.personalplatform.treasury.ops.OpsDtos.ReverseRequest;
import com.personalplatform.treasury.ops.OpsDtos.SpendRequest;
import com.personalplatform.treasury.ops.OpsDtos.SpendResult;
import com.personalplatform.treasury.ops.OpsDtos.SplitRequest;
import com.personalplatform.treasury.ops.OpsDtos.SplitResult;
import com.personalplatform.treasury.ops.OpsDtos.TransferRequest;
import com.personalplatform.treasury.ops.TreasuryOps;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Ledger operations. Every POST requires an {@code Idempotency-Key} header. */
@RestController
@RequestMapping("/v1/households/{householdId}")
public class LedgerController {

    private final TreasuryOps ops;
    private final ApprovalService approvals;

    public LedgerController(TreasuryOps ops, ApprovalService approvals) {
        this.ops = ops;
        this.approvals = approvals;
    }

    @PostMapping("/deposits")
    public ResponseEntity<EntryView> deposit(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId,
                                             @RequestHeader("Idempotency-Key") String key, @Valid @RequestBody DepositRequest req) {
        return Responses.of(ops.deposit(jwt.getSubject(), householdId, key, req));
    }

    /** 201 with the posted entry, or 202 with a PENDING_APPROVAL request when the amount exceeds the household threshold. */
    @PostMapping("/spends")
    public ResponseEntity<SpendResult> spend(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId,
                                             @RequestHeader("Idempotency-Key") String key, @Valid @RequestBody SpendRequest req) {
        return Responses.of(ops.spend(jwt.getSubject(), householdId, key, req));
    }

    @PostMapping("/transfers")
    public ResponseEntity<EntryView> transfer(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId,
                                              @RequestHeader("Idempotency-Key") String key, @Valid @RequestBody TransferRequest req) {
        return Responses.of(ops.transfer(jwt.getSubject(), householdId, key, req));
    }

    @PostMapping("/splits")
    public ResponseEntity<SplitResult> split(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId,
                                             @RequestHeader("Idempotency-Key") String key, @Valid @RequestBody SplitRequest req) {
        return Responses.of(ops.split(jwt.getSubject(), householdId, key, req));
    }

    @PostMapping("/entries/{entryId}/reverse")
    public ResponseEntity<EntryView> reverse(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId,
                                             @PathVariable UUID entryId, @RequestHeader("Idempotency-Key") String key,
                                             @Valid @RequestBody(required = false) ReverseRequest req) {
        return Responses.of(ops.reverse(jwt.getSubject(), householdId, key, entryId, req));
    }

    @GetMapping("/entries/{entryId}")
    public EntryView entry(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId, @PathVariable UUID entryId) {
        return ops.entry(jwt.getSubject(), householdId, entryId);
    }

    @GetMapping("/entries")
    public List<EntryView> entries(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId,
                                   @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
        if (page < 0 || size < 1 || size > 200) {
            throw ApiException.badRequest("INVALID_PAGING", "page >= 0 and 1 <= size <= 200");
        }
        return ops.entries(jwt.getSubject(), householdId, page, size);
    }

    // ---- approvals -----------------------------------------------------------------------------------------

    @GetMapping("/approvals")
    public List<ApprovalView> approvals(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId,
                                        @RequestParam(required = false) String status) {
        return approvals.list(jwt.getSubject(), householdId, status);
    }

    @GetMapping("/approvals/{approvalId}")
    public ApprovalView approval(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId, @PathVariable UUID approvalId) {
        return approvals.get(jwt.getSubject(), householdId, approvalId);
    }

    @PostMapping("/approvals/{approvalId}/approve")
    public ResponseEntity<ApprovalView> approve(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId,
                                                @PathVariable UUID approvalId, @RequestHeader("Idempotency-Key") String key) {
        return Responses.of(approvals.approve(jwt.getSubject(), householdId, key, approvalId));
    }

    public record RejectRequest(@jakarta.validation.constraints.Size(max = 500) String note) {}

    @PostMapping("/approvals/{approvalId}/reject")
    public ResponseEntity<ApprovalView> reject(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId,
                                               @PathVariable UUID approvalId, @RequestHeader("Idempotency-Key") String key,
                                               @Valid @RequestBody(required = false) RejectRequest req) {
        return Responses.of(approvals.reject(jwt.getSubject(), householdId, key, approvalId, req == null ? null : req.note()));
    }
}
