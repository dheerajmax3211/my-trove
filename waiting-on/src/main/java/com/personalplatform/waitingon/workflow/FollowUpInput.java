package com.personalplatform.waitingon.workflow;

import com.personalplatform.waitingon.escalation.EscalationPlan;
import java.util.UUID;

public record FollowUpInput(UUID itemId, EscalationPlan plan) {
}
