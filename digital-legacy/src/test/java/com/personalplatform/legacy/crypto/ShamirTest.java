package com.personalplatform.legacy.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import org.junit.jupiter.api.Test;

class ShamirTest {

    /** Deterministic SecureRandom so failures are reproducible. */
    static SecureRandom seeded(long seed) {
        return new SecureRandom() {
            private final Random r = new Random(seed);

            @Override
            public void nextBytes(byte[] bytes) {
                r.nextBytes(bytes);
            }
        };
    }

    private static byte[] secret(int len, long seed) {
        byte[] b = new byte[len];
        new Random(seed).nextBytes(b);
        return b;
    }

    // ---- field ----------------------------------------------------------------------------------------

    @Test
    void fieldMatchesTheAesTestVectors() {
        assertThat(Gf256.mul(0x53, 0xCA)).isEqualTo(0x01); // FIPS-197 inverse pair
        assertThat(Gf256.mul(0x57, 0x83)).isEqualTo(0xC1); // FIPS-197 section 4.2
        assertThat(Gf256.mul(0x57, 0x13)).isEqualTo(0xFE);
    }

    @Test
    void fieldAxiomsHoldExhaustively() {
        for (int a = 0; a < 256; a++) {
            assertThat(Gf256.mul(a, 1)).isEqualTo(a);
            assertThat(Gf256.mul(a, 0)).isZero();
            assertThat(Gf256.add(a, a)).isZero();
            if (a != 0) {
                assertThat(Gf256.mul(a, Gf256.inv(a))).isEqualTo(1);
            }
            for (int b = 0; b < 256; b++) {
                assertThat(Gf256.mul(a, b)).isEqualTo(Gf256.mul(b, a));
            }
        }
        for (int a = 0; a < 256; a += 7) {
            for (int b = 0; b < 256; b += 5) {
                for (int c = 0; c < 256; c += 3) {
                    assertThat(Gf256.mul(a, Gf256.add(b, c)))
                            .isEqualTo(Gf256.add(Gf256.mul(a, b), Gf256.mul(a, c)));
                    assertThat(Gf256.mul(Gf256.mul(a, b), c)).isEqualTo(Gf256.mul(a, Gf256.mul(b, c)));
                }
            }
        }
        assertThatThrownBy(() -> Gf256.inv(0)).isInstanceOf(ArithmeticException.class);
    }

    // ---- correctness ------------------------------------------------------------------------------------

    @Test
    void anyThresholdSubsetReconstructsForManyParameters() {
        int[][] params = {{1, 1}, {2, 1}, {2, 2}, {3, 2}, {3, 3}, {5, 3}, {6, 4}, {7, 1}, {7, 7}, {8, 5}, {10, 6}};
        for (int[] p : params) {
            int n = p[0];
            int t = p[1];
            byte[] secret = secret(33, n * 31L + t);
            List<Shamir.Share> shares = new Shamir(seeded(n * 100L + t)).split(secret, n, t);
            assertThat(shares).hasSize(n);
            int checked = 0;
            for (int mask = 0; mask < (1 << n); mask++) {
                if (Integer.bitCount(mask) != t) {
                    continue;
                }
                List<Shamir.Share> subset = new ArrayList<>();
                for (int i = 0; i < n; i++) {
                    if ((mask & (1 << i)) != 0) {
                        subset.add(shares.get(i));
                    }
                }
                Collections.shuffle(subset, new Random(mask));
                assertThat(Shamir.combine(subset)).as("n=%d t=%d mask=%d", n, t, mask).isEqualTo(secret);
                checked++;
            }
            assertThat(checked).isPositive();
        }
    }

    @Test
    void supersetsAndRandomShapesReconstruct() {
        Random dice = new Random(42);
        for (int round = 0; round < 200; round++) {
            int n = 1 + dice.nextInt(30);
            int t = 1 + dice.nextInt(n);
            byte[] secret = secret(1 + dice.nextInt(64), round);
            List<Shamir.Share> shares = new Shamir(seeded(round)).split(secret, n, t);
            Collections.shuffle(shares, dice);
            int take = t + dice.nextInt(n - t + 1);
            assertThat(Shamir.combine(shares.subList(0, take))).isEqualTo(secret);
        }
    }

    @Test
    void worksWithTheRealSecureRandomAndMaxShares() {
        byte[] secret = secret(32, 1);
        List<Shamir.Share> shares = new Shamir(new SecureRandom()).split(secret, 255, 128);
        assertThat(Shamir.combine(shares.subList(100, 228))).isEqualTo(secret);
    }

    @Test
    void encodingRoundTrips() {
        byte[] secret = secret(40, 3);
        for (Shamir.Share s : new Shamir(seeded(1)).split(secret, 5, 3)) {
            Shamir.Share back = Shamir.Share.decode(s.encode());
            assertThat(back.x()).isEqualTo(s.x());
            assertThat(back.threshold()).isEqualTo(3);
            assertThat(back.y()).isEqualTo(s.y());
            assertThat(back.setId()).isEqualTo(s.setId());
        }
    }

    // ---- secrecy ---------------------------------------------------------------------------------------

    @Test
    void fewerThanThresholdSharesAreConsistentWithEverySecret() {
        // For t-1 shares and ANY candidate secret there is exactly one polynomial through them, so the t-1 shares
        // pin down nothing: mapping candidate secret -> value at a fresh point is a bijection on a byte.
        int t = 4;
        byte[] secret = new byte[] {(byte) 0xAB};
        List<Shamir.Share> shares = new Shamir(seeded(7)).split(secret, 6, t);
        int[] xs = {shares.get(0).x(), shares.get(1).x(), shares.get(2).x()};
        int freshX = shares.get(5).x();
        Set<Integer> seen = new HashSet<>();
        for (int candidate = 0; candidate < 256; candidate++) {
            // polynomial through (0, candidate) and the three known shares
            int[] pxs = {0, xs[0], xs[1], xs[2]};
            byte[][] pys = {{(byte) candidate}, shares.get(0).y(), shares.get(1).y(), shares.get(2).y()};
            seen.add(Shamir.interpolate(pxs, pys, freshX)[0] & 0xff);
        }
        assertThat(seen).hasSize(256);
    }

    @Test
    void singleShareOfATwoOfNSplitLooksUniformForAFixedSecret() {
        // Statistical sanity check: share byte for a fixed secret byte over many fresh splits is ~uniform.
        int[] counts = new int[256];
        int trials = 256 * 200;
        byte[] secret = {0x42};
        SecureRandom rng = seeded(99);
        Shamir shamir = new Shamir(rng);
        for (int i = 0; i < trials; i++) {
            counts[shamir.split(secret, 3, 2).get(0).y()[0] & 0xff]++;
        }
        double expected = trials / 256.0;
        double chi2 = 0;
        for (int c : counts) {
            chi2 += (c - expected) * (c - expected) / expected;
        }
        // 255 degrees of freedom: mean 255, sd ~22.6; 400 is > 6 sigma, so a correct implementation never fails
        assertThat(chi2).isLessThan(400.0);
    }

    @Test
    void tMinusOneSharesDoNotRevealTheSecretWhenCombined() {
        byte[] secret = secret(24, 5);
        List<Shamir.Share> shares = new Shamir(seeded(5)).split(secret, 5, 3);
        assertThatThrownBy(() -> Shamir.combine(shares.subList(0, 2)))
                .isInstanceOf(ShamirException.class).hasMessageContaining("need 3");
    }

    @Test
    void thresholdOneMeansEveryShareIsTheSecret() {
        byte[] secret = secret(8, 6);
        for (Shamir.Share s : new Shamir(seeded(6)).split(secret, 4, 1)) {
            assertThat(s.y()).isEqualTo(secret);
        }
    }

    // ---- rejection -------------------------------------------------------------------------------------

    @Test
    void rejectsBadParameters() {
        Shamir s = new Shamir(seeded(1));
        byte[] ok = secret(4, 1);
        assertThatThrownBy(() -> s.split(ok, 3, 4)).isInstanceOf(ShamirException.class);
        assertThatThrownBy(() -> s.split(ok, 3, 0)).isInstanceOf(ShamirException.class);
        assertThatThrownBy(() -> s.split(ok, 256, 2)).isInstanceOf(ShamirException.class);
        assertThatThrownBy(() -> s.split(ok, 0, 0)).isInstanceOf(ShamirException.class);
        assertThatThrownBy(() -> s.split(new byte[0], 3, 2)).isInstanceOf(ShamirException.class);
        assertThatThrownBy(() -> s.split(null, 3, 2)).isInstanceOf(ShamirException.class);
        assertThatThrownBy(() -> new Shamir(null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsDuplicateShares() {
        List<Shamir.Share> shares = new Shamir(seeded(2)).split(secret(10, 2), 4, 3);
        List<Shamir.Share> dup = List.of(shares.get(0), shares.get(1), shares.get(0));
        assertThatThrownBy(() -> Shamir.combine(dup)).isInstanceOf(ShamirException.class)
                .hasMessageContaining("duplicate");
    }

    @Test
    void rejectsSharesFromDifferentSplits() {
        byte[] secret = secret(10, 2);
        List<Shamir.Share> a = new Shamir(seeded(1)).split(secret, 3, 2);
        List<Shamir.Share> b = new Shamir(seeded(2)).split(secret, 3, 2);
        assertThatThrownBy(() -> Shamir.combine(List.of(a.get(0), b.get(1))))
                .isInstanceOf(ShamirException.class).hasMessageContaining("different splits");
    }

    @Test
    void rejectsMismatchedThresholdAndLength() {
        Shamir.Share a = new Shamir(seeded(1)).split(secret(10, 2), 3, 2).get(0);
        byte[] setId = a.setId();
        Shamir.Share otherT = new Shamir.Share(3, setId, 2, secret(10, 3));
        Shamir.Share otherLen = new Shamir.Share(2, setId, 2, secret(11, 3));
        assertThatThrownBy(() -> Shamir.combine(List.of(a, otherT))).hasMessageContaining("threshold");
        assertThatThrownBy(() -> Shamir.combine(List.of(a, otherLen))).hasMessageContaining("lengths");
    }

    @Test
    void rejectsMalformedEncodings() {
        byte[] good = new Shamir(seeded(1)).split(secret(10, 2), 3, 2).get(0).encode();
        assertThatThrownBy(() -> Shamir.Share.decode(null)).isInstanceOf(ShamirException.class);
        assertThatThrownBy(() -> Shamir.Share.decode(new byte[3])).isInstanceOf(ShamirException.class);
        byte[] badVersion = good.clone();
        badVersion[0] = 9;
        assertThatThrownBy(() -> Shamir.Share.decode(badVersion)).hasMessageContaining("version");
        byte[] zeroX = good.clone();
        zeroX[6] = 0;
        assertThatThrownBy(() -> Shamir.Share.decode(zeroX)).hasMessageContaining("x-coordinate");
        byte[] zeroT = good.clone();
        zeroT[1] = 0;
        assertThatThrownBy(() -> Shamir.Share.decode(zeroT)).hasMessageContaining("threshold");
        assertThatThrownBy(() -> Shamir.combine(List.of())).isInstanceOf(ShamirException.class);
        assertThatThrownBy(() -> Shamir.combine(null)).isInstanceOf(ShamirException.class);
    }

    @Test
    void detectsATamperedShareWhenSurplusSharesAreSupplied() {
        byte[] secret = secret(16, 8);
        List<Shamir.Share> shares = new Shamir(seeded(8)).split(secret, 5, 3);
        byte[] y = shares.get(4).y();
        y[0] ^= 0x01;
        Shamir.Share tampered = new Shamir.Share(3, shares.get(4).setId(), shares.get(4).x(), y);
        List<Shamir.Share> input = new ArrayList<>(shares.subList(0, 4));
        input.add(tampered);
        assertThatThrownBy(() -> Shamir.combine(input)).hasMessageContaining("inconsistent");
        // Exactly t shares cannot be cross-checked: a tampered one yields a wrong secret (AES-GCM catches that).
        List<Shamir.Share> exactly = List.of(shares.get(0), shares.get(1), tampered);
        assertThat(Shamir.combine(exactly)).isNotEqualTo(secret);
    }

    @Test
    void sharesAreDefensivelyCopied() {
        byte[] secret = secret(8, 9);
        List<Shamir.Share> shares = new Shamir(seeded(9)).split(secret, 3, 2);
        shares.get(0).y()[0] ^= 0x7f; // mutating a returned copy must not corrupt the share
        assertThat(Shamir.combine(shares.subList(0, 2))).isEqualTo(secret);
        assertThat(Arrays.equals(shares.get(0).y(), shares.get(1).y())).isFalse();
    }
}
