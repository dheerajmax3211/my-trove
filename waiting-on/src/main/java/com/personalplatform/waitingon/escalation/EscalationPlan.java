package com.personalplatform.waitingon.escalation;

import com.personalplatform.waitingon.item.ItemCategory;

/**
 * When the follow-up workflow acts, as whole days after the workflow starts (item creation).
 * {@code finalNoticeAfterDays == 0} means there is no final-notice stage.
 * Pure value object: ordering rules are enforced on construction.
 */
public record EscalationPlan(int nudgeAfterDays, int escalateAfterDays, int finalNoticeAfterDays,
        int expireAfterDays) {

    public EscalationPlan {
        if (nudgeAfterDays < 1) {
            throw new IllegalArgumentException("nudgeAfterDays must be >= 1");
        }
        if (escalateAfterDays <= nudgeAfterDays) {
            throw new IllegalArgumentException("escalateAfterDays must be after nudgeAfterDays");
        }
        if (finalNoticeAfterDays < 0) {
            throw new IllegalArgumentException("finalNoticeAfterDays must be >= 0 (0 disables the stage)");
        }
        if (finalNoticeAfterDays != 0 && finalNoticeAfterDays <= escalateAfterDays) {
            throw new IllegalArgumentException("finalNoticeAfterDays must be after escalateAfterDays");
        }
        if (expireAfterDays <= Math.max(escalateAfterDays, finalNoticeAfterDays)) {
            throw new IllegalArgumentException("expireAfterDays must be after the last escalation stage");
        }
    }

    public boolean hasFinalNotice() {
        return finalNoticeAfterDays > 0;
    }

    /**
     * Sensible defaults per category. Offsets are measured from the date the item is expected to be
     * resolved ({@code daysUntilExpected}, clamped at 0 when already overdue), so a refund promised in 10 days is
     * first nudged 3 days after that date, not 3 days after creation.
     */
    public static EscalationPlan defaultFor(ItemCategory category, long daysUntilExpected) {
        int base = (int) Math.max(0, Math.min(daysUntilExpected, 365));
        return switch (category) {
            case REFUND -> new EscalationPlan(base + 3, base + 10, base + 21, base + 45);
            case CLAIM -> new EscalationPlan(base + 7, base + 21, base + 35, base + 90);
            case REIMBURSEMENT -> new EscalationPlan(base + 5, base + 14, base + 28, base + 60);
            case APPROVAL -> new EscalationPlan(base + 3, base + 7, base + 14, base + 30);
            case DELIVERY -> new EscalationPlan(base + 2, base + 7, base + 14, base + 30);
            case OTHER -> new EscalationPlan(base + 5, base + 14, 0, base + 45);
        };
    }
}
