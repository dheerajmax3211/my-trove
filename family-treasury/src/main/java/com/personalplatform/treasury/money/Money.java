package com.personalplatform.treasury.money;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Currency;
import java.util.List;

/**
 * An amount of money in the minor unit of an ISO-4217 currency (cents for USD). Backed by a {@code long};
 * floating point is never used. All arithmetic is overflow-checked ({@link ArithmeticException}).
 */
public record Money(long minor, String currency) implements Comparable<Money> {

    public Money {
        if (currency == null || currency.length() != 3) {
            throw new IllegalArgumentException("currency must be a 3-letter ISO-4217 code");
        }
        try {
            Currency.getInstance(currency);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("unknown currency: " + currency, e);
        }
    }

    public static Money of(long minor, String currency) {
        return new Money(minor, currency);
    }

    public static Money zero(String currency) {
        return new Money(0, currency);
    }

    public Money plus(Money other) {
        requireSameCurrency(other);
        return new Money(Math.addExact(minor, other.minor), currency);
    }

    public Money minus(Money other) {
        requireSameCurrency(other);
        return new Money(Math.subtractExact(minor, other.minor), currency);
    }

    public Money negate() {
        return new Money(Math.negateExact(minor), currency);
    }

    public boolean isZero() {
        return minor == 0;
    }

    public boolean isPositive() {
        return minor > 0;
    }

    public boolean isNegative() {
        return minor < 0;
    }

    @Override
    public int compareTo(Money other) {
        requireSameCurrency(other);
        return Long.compare(minor, other.minor);
    }

    /** Plain decimal text using the currency's standard fraction digits, e.g. {@code 1234 USD -> "12.34"}. */
    public String toDecimalString() {
        int digits = Math.max(Currency.getInstance(currency).getDefaultFractionDigits(), 0);
        return BigDecimal.valueOf(minor, digits).toPlainString();
    }

    /** Splits this amount proportionally to {@code weights}; see {@link #allocateMinor(long, long...)}. */
    public List<Money> allocate(long... weights) {
        long[] parts = allocateMinor(minor, weights);
        List<Money> out = new ArrayList<>(parts.length);
        for (long p : parts) {
            out.add(new Money(p, currency));
        }
        return out;
    }

    /** Equal split into {@code n} parts. */
    public List<Money> splitEvenly(int n) {
        if (n <= 0) {
            throw new IllegalArgumentException("n must be positive");
        }
        long[] weights = new long[n];
        Arrays.fill(weights, 1);
        return allocate(weights);
    }

    /**
     * Largest-remainder (Hamilton) allocation of {@code total} minor units across {@code weights}.
     * Each part first gets floor(total * w / W); the units left over (always fewer than the number of
     * positively weighted parts) go one each to the parts with the largest fractional remainders, ties
     * broken by lowest index so the result is deterministic. The parts ALWAYS sum exactly to {@code total}.
     * Negative totals are allocated by magnitude and negated. Zero-weight parts receive zero.
     */
    public static long[] allocateMinor(long total, long... weights) {
        if (weights == null || weights.length == 0) {
            throw new IllegalArgumentException("at least one weight is required");
        }
        BigInteger sumWeights = BigInteger.ZERO;
        for (long w : weights) {
            if (w < 0) {
                throw new IllegalArgumentException("weights must not be negative");
            }
            sumWeights = sumWeights.add(BigInteger.valueOf(w));
        }
        if (sumWeights.signum() == 0) {
            throw new IllegalArgumentException("at least one weight must be positive");
        }
        BigInteger magnitude = BigInteger.valueOf(total).abs();
        int n = weights.length;
        BigInteger[] floors = new BigInteger[n];
        BigInteger[] remainders = new BigInteger[n];
        BigInteger allocated = BigInteger.ZERO;
        for (int i = 0; i < n; i++) {
            BigInteger[] qr = magnitude.multiply(BigInteger.valueOf(weights[i])).divideAndRemainder(sumWeights);
            floors[i] = qr[0];
            remainders[i] = qr[1];
            allocated = allocated.add(qr[0]);
        }
        int leftover = magnitude.subtract(allocated).intValueExact();
        List<Integer> order = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            if (weights[i] > 0) {
                order.add(i);
            }
        }
        order.sort(Comparator.<Integer, BigInteger>comparing(i -> remainders[i]).reversed().thenComparing(i -> i));
        long[] result = new long[n];
        for (int i = 0; i < n; i++) {
            result[i] = floors[i].longValueExact();
        }
        for (int k = 0; k < leftover; k++) {
            result[order.get(k)]++;
        }
        if (total < 0) {
            for (int i = 0; i < n; i++) {
                result[i] = -result[i];
            }
        }
        return result;
    }

    private void requireSameCurrency(Money other) {
        if (!currency.equals(other.currency)) {
            throw new IllegalArgumentException("currency mismatch: " + currency + " vs " + other.currency);
        }
    }
}
