package com.personalplatform.treasury;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.treasury.allowance.Frequency;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class FrequencyTest {

    @Test
    void weeklyIndexAndStart() {
        LocalDate a = LocalDate.of(2026, 3, 2);
        assertThat(Frequency.WEEKLY.latestIndexOnOrBefore(a, LocalDate.of(2026, 3, 1))).isEqualTo(-1);
        assertThat(Frequency.WEEKLY.latestIndexOnOrBefore(a, a)).isZero();
        assertThat(Frequency.WEEKLY.latestIndexOnOrBefore(a, LocalDate.of(2026, 3, 8))).isZero();
        assertThat(Frequency.WEEKLY.latestIndexOnOrBefore(a, LocalDate.of(2026, 3, 9))).isEqualTo(1);
        assertThat(Frequency.WEEKLY.periodStart(a, 3)).isEqualTo(LocalDate.of(2026, 3, 23));
    }

    @Test
    void monthlyClampsToMonthEndWithoutDrift() {
        LocalDate a = LocalDate.of(2026, 1, 31);
        assertThat(Frequency.MONTHLY.periodStart(a, 1)).isEqualTo(LocalDate.of(2026, 2, 28));
        assertThat(Frequency.MONTHLY.periodStart(a, 2)).isEqualTo(LocalDate.of(2026, 3, 31));
        assertThat(Frequency.MONTHLY.periodStart(a, 3)).isEqualTo(LocalDate.of(2026, 4, 30));
        assertThat(Frequency.MONTHLY.latestIndexOnOrBefore(a, LocalDate.of(2026, 2, 27))).isZero();
        assertThat(Frequency.MONTHLY.latestIndexOnOrBefore(a, LocalDate.of(2026, 2, 28))).isEqualTo(1);
        assertThat(Frequency.MONTHLY.latestIndexOnOrBefore(a, LocalDate.of(2026, 3, 30))).isEqualTo(1);
        assertThat(Frequency.MONTHLY.latestIndexOnOrBefore(a, LocalDate.of(2026, 3, 31))).isEqualTo(2);
    }

    @Test
    void indexAndStartAreConsistentForEveryDayOfAYear() {
        LocalDate a = LocalDate.of(2026, 1, 31);
        for (Frequency f : Frequency.values()) {
            for (LocalDate d = a; d.isBefore(a.plusYears(1)); d = d.plusDays(1)) {
                long k = f.latestIndexOnOrBefore(a, d);
                assertThat(f.periodStart(a, k)).isBeforeOrEqualTo(d);
                assertThat(f.periodStart(a, k + 1)).isAfter(d);
            }
        }
    }
}
