package com.personalplatform.treasury.money;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Arrays;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;

class MoneyTest {

    @Test
    void arithmeticIsExactAndCurrencySafe() {
        Money a = Money.of(1050, "USD");
        assertThat(a.plus(Money.of(5, "USD"))).isEqualTo(Money.of(1055, "USD"));
        assertThat(a.minus(Money.of(1100, "USD"))).isEqualTo(Money.of(-50, "USD"));
        assertThat(a.negate().minor()).isEqualTo(-1050);
        assertThatThrownBy(() -> a.plus(Money.of(1, "EUR"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Money.of(Long.MAX_VALUE, "USD").plus(Money.of(1, "USD")))
                .isInstanceOf(ArithmeticException.class);
        assertThatThrownBy(() -> Money.of(1, "XXXX")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Money.of(1, "ZZZ")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void decimalStringUsesCurrencyFractionDigitsWithoutFloatingPoint() {
        assertThat(Money.of(1234, "USD").toDecimalString()).isEqualTo("12.34");
        assertThat(Money.of(-5, "USD").toDecimalString()).isEqualTo("-0.05");
        assertThat(Money.of(1234, "JPY").toDecimalString()).isEqualTo("1234");
        assertThat(Money.of(1234, "KWD").toDecimalString()).isEqualTo("1.234");
    }

    @Test
    void hundredSplitThreeWaysGivesTheExtraCentToTheFirstOnTies() {
        assertThat(Money.of(100, "USD").splitEvenly(3)).extracting(Money::minor).containsExactly(34L, 33L, 33L);
        assertThat(Money.of(1, "USD").splitEvenly(3)).extracting(Money::minor).containsExactly(1L, 0L, 0L);
    }

    @Test
    void weightedAllocationGivesLeftoverToLargestRemainders() {
        // 10 split 1:1:1:7 -> exact shares 1,1,1,7 ; and 100 over 3:3:4 -> 30,30,40
        assertThat(Money.allocateMinor(10, 1, 1, 1, 7)).containsExactly(1, 1, 1, 7);
        assertThat(Money.allocateMinor(100, 3, 3, 4)).containsExactly(30, 30, 40);
        // 5 over 1:2 -> exact 1.67, 3.33 -> floors 1,3 leftover 1 goes to the larger remainder (index 0: .67)
        assertThat(Money.allocateMinor(5, 1, 2)).containsExactly(2, 3);
    }

    @Test
    void zeroWeightPartsGetNothingAndNegativeTotalsMirrorPositive() {
        assertThat(Money.allocateMinor(7, 0, 1, 1)).containsExactly(0, 4, 3);
        assertThat(Money.allocateMinor(-7, 0, 1, 1)).containsExactly(0, -4, -3);
        assertThat(Money.allocateMinor(0, 1, 1)).containsExactly(0, 0);
    }

    @Test
    void invalidWeightsAreRejected() {
        assertThatThrownBy(() -> Money.allocateMinor(10)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Money.allocateMinor(10, 0, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Money.allocateMinor(10, 1, -1)).isInstanceOf(IllegalArgumentException.class);
    }

    /** Property-style: for many random totals/weights the parts sum exactly, never stray more than 1 unit from the ideal share. */
    @Test
    void allocationAlwaysSumsExactlyAndStaysWithinOneUnitOfTheIdealShare() {
        Random rnd = new Random(20260302L);
        for (int iteration = 0; iteration < 20_000; iteration++) {
            int n = 1 + rnd.nextInt(12);
            long[] weights = new long[n];
            long sum = 0;
            for (int i = 0; i < n; i++) {
                weights[i] = rnd.nextInt(4) == 0 ? 0 : 1 + rnd.nextInt(1000);
                sum += weights[i];
            }
            if (sum == 0) {
                weights[rnd.nextInt(n)] = 1 + rnd.nextInt(1000);
                sum = Arrays.stream(weights).sum();
            }
            long total = switch (rnd.nextInt(4)) {
                case 0 -> rnd.nextInt(50);
                case 1 -> -rnd.nextInt(50);
                case 2 -> (long) (rnd.nextGaussian() * 1_000_000);
                default -> rnd.nextLong() / 4; // very large totals exercise the BigInteger path
            };
            long[] parts = Money.allocateMinor(total, weights);

            assertThat(Arrays.stream(parts).sum()).as("sum for total=%d weights=%s", total, Arrays.toString(weights)).isEqualTo(total);
            for (int i = 0; i < n; i++) {
                if (weights[i] == 0) {
                    assertThat(parts[i]).isZero();
                }
                java.math.BigDecimal ideal = java.math.BigDecimal.valueOf(total).multiply(java.math.BigDecimal.valueOf(weights[i]))
                        .divide(java.math.BigDecimal.valueOf(sum), 30, java.math.RoundingMode.HALF_EVEN);
                assertThat(java.math.BigDecimal.valueOf(parts[i]).subtract(ideal).abs().compareTo(java.math.BigDecimal.ONE))
                        .as("part %d of %s", i, Arrays.toString(parts)).isLessThan(0);
            }
        }
    }

    @Test
    void allocateOnMoneyKeepsCurrencyAndTotal() {
        List<Money> parts = Money.of(1001, "EUR").allocate(1, 1, 1);
        assertThat(parts).extracting(Money::currency).containsOnly("EUR");
        assertThat(parts.stream().mapToLong(Money::minor).sum()).isEqualTo(1001);
    }
}
