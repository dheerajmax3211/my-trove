package com.personalplatform.waitingon.escalation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.waitingon.item.ItemCategory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class EscalationPlanTest {

    @ParameterizedTest
    @EnumSource(ItemCategory.class)
    void defaultsAreAlwaysValidAndAnchoredOnTheExpectedDate(ItemCategory c) {
        EscalationPlan overdue = EscalationPlan.defaultFor(c, -30);
        EscalationPlan in10Days = EscalationPlan.defaultFor(c, 10);
        assertThat(in10Days.nudgeAfterDays()).isEqualTo(overdue.nudgeAfterDays() + 10);
        assertThat(in10Days.expireAfterDays()).isEqualTo(overdue.expireAfterDays() + 10);
    }

    @Test
    void otherHasNoFinalNotice() {
        assertThat(EscalationPlan.defaultFor(ItemCategory.OTHER, 0).hasFinalNotice()).isFalse();
        assertThat(EscalationPlan.defaultFor(ItemCategory.REFUND, 0).hasFinalNotice()).isTrue();
    }

    @Test
    void rejectsMisorderedStages() {
        assertThatThrownBy(() -> new EscalationPlan(0, 5, 0, 10)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new EscalationPlan(5, 5, 0, 10)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new EscalationPlan(2, 5, 4, 10)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new EscalationPlan(2, 5, 8, 8)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new EscalationPlan(2, 5, 0, 5)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new EscalationPlan(2, 5, -1, 9)).isInstanceOf(IllegalArgumentException.class);
        new EscalationPlan(2, 5, 0, 9);
        new EscalationPlan(2, 5, 8, 9);
    }
}
