package com.personalplatform.homepulse.reminder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import com.personalplatform.homepulse.appliance.Appliance;
import com.personalplatform.homepulse.detect.ApplianceType;
import com.personalplatform.homepulse.reminder.Reminder.Source;
import com.personalplatform.homepulse.reminder.Reminder.Type;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ReminderCalculatorTest {

    static final LocalDate TODAY = LocalDate.of(2031, 1, 15);

    private static Appliance appliance(String name, LocalDate warrantyEnd, LocalDate nextService) {
        return new Appliance(UUID.randomUUID(), "uid", name, ApplianceType.FRIDGE, null, null, warrantyEnd, null,
                nextService, null, Instant.EPOCH, Instant.EPOCH);
    }

    @Test
    void serviceBoundaries() {
        var overdue = appliance("a", null, TODAY.minusDays(1));
        var today = appliance("b", null, TODAY);
        var atHorizon = appliance("c", null, TODAY.plusDays(60));
        var beyond = appliance("d", null, TODAY.plusDays(61));
        var rs = ReminderCalculator.compute(List.of(overdue, today, atHorizon, beyond), Set.of(), TODAY, 60);
        assertThat(rs).extracting(Reminder::applianceName).containsExactly("a", "b", "c");
        assertThat(rs).extracting(Reminder::type).containsExactly(Type.SERVICE_OVERDUE, Type.SERVICE_DUE, Type.SERVICE_DUE);
        assertThat(rs.get(0).daysUntil()).isEqualTo(-1);
    }

    @Test
    void warrantyEndingOnlyWithinHorizonAndNeverWhenExpired() {
        var rs = ReminderCalculator.compute(List.of(
                appliance("expired", TODAY.minusDays(1), null),
                appliance("today", TODAY, null),
                appliance("soon", TODAY.plusDays(30), null),
                appliance("later", TODAY.plusDays(500), null)), Set.of(), TODAY, 60);
        assertThat(rs).extracting(Reminder::applianceName).containsExactly("today", "soon");
        assertThat(rs).extracting(Reminder::type).containsOnly(Type.WARRANTY_ENDING);
    }

    @Test
    void liveAlertUnderWarrantyBecomesAHighPriorityClaimReminderEvenWhenWarrantyIsFarAway() {
        var a = appliance("fridge", TODAY.plusDays(300), null);
        var calm = appliance("calm", TODAY.plusDays(10), null);
        var rs = ReminderCalculator.compute(List.of(calm, a), Set.of(a.id()), TODAY, 60);
        assertThat(rs.get(0).applianceName()).isEqualTo("fridge");
        assertThat(rs.get(0).type()).isEqualTo(Type.WARRANTY_CLAIM_WINDOW);
        assertThat(rs.get(0).highPriority()).isTrue();
        assertThat(rs.get(1).type()).isEqualTo(Type.WARRANTY_ENDING);
    }

    @Test
    void alertOutOfWarrantyOnlyEscalatesServiceReminders() {
        var a = appliance("old", TODAY.minusDays(100), TODAY.minusDays(5));
        var rs = ReminderCalculator.compute(List.of(a), Set.of(a.id()), TODAY, 60);
        assertThat(rs).hasSize(1);
        assertThat(rs.get(0).type()).isEqualTo(Type.SERVICE_OVERDUE);
        assertThat(rs.get(0).highPriority()).isTrue();
        assertThat(rs.get(0).message()).contains("anomaly");
    }

    @Test
    void everyReminderSaysWhichRecordItCameFrom() {
        var fridge = appliance("fridge", TODAY.plusDays(300), TODAY.plusDays(10));
        var kettle = appliance("kettle", TODAY.plusDays(20), TODAY.minusDays(2));
        var rs = ReminderCalculator.compute(List.of(fridge, kettle), Set.of(fridge.id()), TODAY, 60);
        assertThat(rs).extracting(Reminder::type, Reminder::source).containsExactlyInAnyOrder(
                tuple(Type.WARRANTY_CLAIM_WINDOW, Source.ALERT),
                tuple(Type.SERVICE_DUE, Source.SERVICE_DATE),
                tuple(Type.WARRANTY_ENDING, Source.WARRANTY_DATE),
                tuple(Type.SERVICE_OVERDUE, Source.SERVICE_DATE));
    }

    @Test
    void nothingToRemindAboutYieldsEmptyList() {
        assertThat(ReminderCalculator.compute(List.of(appliance("x", null, null)), Set.of(), TODAY, 60)).isEmpty();
        assertThat(ReminderCalculator.compute(List.of(), Set.of(), TODAY, 60)).isEmpty();
    }
}
