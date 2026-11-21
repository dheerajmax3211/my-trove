package com.personalplatform.shared;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.shared.reminder.Recurrence;
import com.personalplatform.shared.reminder.Recurrence.Unit;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class RecurrenceTest {

    private static Instant t(String s) {
        return Instant.parse(s);
    }

    @Test
    void dailyAndIntervals() {
        Instant anchor = t("2026-01-15T10:00:00Z");
        assertThat(new Recurrence(Unit.DAILY, 1).nextAfter(anchor, anchor)).isEqualTo(t("2026-01-16T10:00:00Z"));
        assertThat(new Recurrence(Unit.DAILY, 3).nextAfter(anchor, t("2026-01-15T10:00:30Z"))).isEqualTo(t("2026-01-18T10:00:00Z"));
        assertThat(new Recurrence(Unit.WEEKLY, 2).nextAfter(anchor, anchor)).isEqualTo(t("2026-01-29T10:00:00Z"));
    }

    @Test
    void strictlyAfterTheReferenceInstant() {
        Instant anchor = t("2026-01-15T10:00:00Z");
        assertThat(new Recurrence(Unit.DAILY, 1).nextAfter(anchor, t("2026-01-16T10:00:00Z"))).isEqualTo(t("2026-01-17T10:00:00Z"));
        assertThat(new Recurrence(Unit.DAILY, 1).nextAfter(anchor, t("2026-01-16T09:59:59Z"))).isEqualTo(t("2026-01-16T10:00:00Z"));
    }

    @Test
    void monthlyFromThe31stDoesNotDrift() {
        Instant anchor = t("2026-01-31T08:00:00Z");
        Recurrence monthly = new Recurrence(Unit.MONTHLY, 1);
        Instant feb = monthly.nextAfter(anchor, anchor);
        assertThat(feb).isEqualTo(t("2026-02-28T08:00:00Z"));
        // next one is computed from the anchor, so it is back on the 31st
        assertThat(monthly.nextAfter(anchor, feb)).isEqualTo(t("2026-03-31T08:00:00Z"));
        assertThat(new Recurrence(Unit.MONTHLY, 3).nextAfter(anchor, anchor)).isEqualTo(t("2026-04-30T08:00:00Z"));
    }

    @Test
    void skipsMissedOccurrencesAfterLongDowntime() {
        Instant anchor = t("2026-01-15T10:00:00Z");
        assertThat(new Recurrence(Unit.DAILY, 1).nextAfter(anchor, t("2026-03-01T12:00:00Z"))).isEqualTo(t("2026-03-02T10:00:00Z"));
        assertThat(new Recurrence(Unit.MONTHLY, 1).nextAfter(anchor, t("2027-06-20T00:00:00Z"))).isEqualTo(t("2027-07-15T10:00:00Z"));
    }

    @Test
    void rejectsNonsense() {
        assertThatThrownBy(() -> new Recurrence(Unit.DAILY, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new Recurrence(null, 1)).isInstanceOf(IllegalArgumentException.class);
    }
}
