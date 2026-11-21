package com.personalplatform.legacy.crypto;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Shamir's Secret Sharing over GF(256), applied independently to every byte of the secret.
 *
 * <p>Each byte {@code s} is the constant term of a random polynomial of degree {@code threshold - 1}; share
 * {@code x} (1..n) carries the polynomial evaluated at {@code x}. Any {@code threshold} shares reconstruct the
 * secret by Lagrange interpolation at 0; any fewer are statistically independent of it (every candidate secret is
 * equally consistent with them).
 *
 * <p>Wire format of one share (all single bytes unless noted):
 * {@code [version=1][threshold][setId(4)][x][y...]}. {@code setId} is a random tag identical across the shares of one
 * split so that shares of different splits are rejected instead of silently producing garbage. Neither the tag nor
 * the metadata reveals anything about the secret.
 *
 * <p>Shamir sharing is NOT authenticated: shares of the right set that were altered will reconstruct a wrong
 * secret. When more than {@code threshold} shares are supplied they are cross-checked for consistency; otherwise the
 * authenticated vault encryption (AES-GCM) is what detects a wrong key.
 *
 * <p>The randomness source is injected so tests can be deterministic; production callers must pass a real
 * {@link SecureRandom}.
 */
public final class Shamir {

    public static final int VERSION = 1;
    public static final int MAX_SHARES = 255;
    public static final int SET_ID_LENGTH = 4;
    public static final int MAX_SECRET_BYTES = 65_536;
    private static final int HEADER = 2 + SET_ID_LENGTH + 1;

    private final SecureRandom random;

    public Shamir(SecureRandom random) {
        if (random == null) {
            throw new IllegalArgumentException("random is required");
        }
        this.random = random;
    }

    /** One share. {@code x} is in 1..255, {@code y} has the same length as the secret. */
    public static final class Share {
        private final int threshold;
        private final byte[] setId;
        private final int x;
        private final byte[] y;

        public Share(int threshold, byte[] setId, int x, byte[] y) {
            if (threshold < 1 || threshold > MAX_SHARES) {
                throw new ShamirException("threshold out of range: " + threshold);
            }
            if (setId == null || setId.length != SET_ID_LENGTH) {
                throw new ShamirException("share set id must be " + SET_ID_LENGTH + " bytes");
            }
            if (x < 1 || x > MAX_SHARES) {
                throw new ShamirException("share x-coordinate out of range: " + x);
            }
            if (y == null || y.length == 0 || y.length > MAX_SECRET_BYTES) {
                throw new ShamirException("share payload has an invalid length");
            }
            this.threshold = threshold;
            this.setId = setId.clone();
            this.x = x;
            this.y = y.clone();
        }

        public int threshold() {
            return threshold;
        }

        public int x() {
            return x;
        }

        public byte[] setId() {
            return setId.clone();
        }

        public byte[] y() {
            return y.clone();
        }

        public byte[] encode() {
            byte[] out = new byte[HEADER + y.length];
            out[0] = VERSION;
            out[1] = (byte) threshold;
            System.arraycopy(setId, 0, out, 2, SET_ID_LENGTH);
            out[2 + SET_ID_LENGTH] = (byte) x;
            System.arraycopy(y, 0, out, HEADER, y.length);
            return out;
        }

        public static Share decode(byte[] encoded) {
            if (encoded == null || encoded.length <= HEADER) {
                throw new ShamirException("share is too short");
            }
            if ((encoded[0] & 0xff) != VERSION) {
                throw new ShamirException("unsupported share version " + (encoded[0] & 0xff));
            }
            return new Share(
                    encoded[1] & 0xff,
                    Arrays.copyOfRange(encoded, 2, 2 + SET_ID_LENGTH),
                    encoded[2 + SET_ID_LENGTH] & 0xff,
                    Arrays.copyOfRange(encoded, HEADER, encoded.length));
        }
    }

    /** Splits {@code secret} into {@code n} shares of which any {@code threshold} reconstruct it. */
    public List<Share> split(byte[] secret, int n, int threshold) {
        if (secret == null || secret.length == 0 || secret.length > MAX_SECRET_BYTES) {
            throw new ShamirException("secret must be 1.." + MAX_SECRET_BYTES + " bytes");
        }
        if (n < 1 || n > MAX_SHARES) {
            throw new ShamirException("n must be in 1.." + MAX_SHARES);
        }
        if (threshold < 1 || threshold > n) {
            throw new ShamirException("threshold must be in 1..n");
        }
        byte[] setId = new byte[SET_ID_LENGTH];
        random.nextBytes(setId);

        // coefficients[d - 1][k] is the degree-d coefficient of the polynomial for secret byte k
        byte[][] coefficients = new byte[threshold - 1][secret.length];
        for (byte[] row : coefficients) {
            random.nextBytes(row);
        }
        List<Share> shares = new ArrayList<>(n);
        for (int x = 1; x <= n; x++) {
            byte[] y = new byte[secret.length];
            for (int k = 0; k < secret.length; k++) {
                int acc = 0; // Horner, highest degree first, constant term last
                for (int d = threshold - 1; d >= 1; d--) {
                    acc = Gf256.add(Gf256.mul(acc, x), coefficients[d - 1][k] & 0xff);
                }
                y[k] = (byte) Gf256.add(Gf256.mul(acc, x), secret[k] & 0xff);
            }
            shares.add(new Share(threshold, setId, x, y));
        }
        for (byte[] row : coefficients) {
            Arrays.fill(row, (byte) 0);
        }
        return shares;
    }

    /**
     * Reconstructs the secret. All shares must come from the same split, have distinct x, and there must be at
     * least {@code threshold} of them. Surplus shares are verified to lie on the same polynomial.
     */
    public static byte[] combine(Collection<Share> shares) {
        if (shares == null || shares.isEmpty()) {
            throw new ShamirException("no shares supplied");
        }
        List<Share> list = new ArrayList<>(shares);
        Share first = list.get(0);
        Set<Integer> seenX = new HashSet<>();
        for (Share s : list) {
            if (s == null) {
                throw new ShamirException("null share");
            }
            if (s.threshold != first.threshold) {
                throw new ShamirException("shares disagree on the threshold");
            }
            if (!Arrays.equals(s.setId, first.setId)) {
                throw new ShamirException("shares belong to different splits");
            }
            if (s.y.length != first.y.length) {
                throw new ShamirException("shares have different lengths");
            }
            if (!seenX.add(s.x)) {
                throw new ShamirException("duplicate share x=" + s.x);
            }
        }
        int t = first.threshold;
        if (list.size() < t) {
            throw new ShamirException("need " + t + " shares but only " + list.size() + " supplied");
        }
        List<Share> base = list.subList(0, t);
        int[] xs = new int[t];
        byte[][] ys = new byte[t][];
        for (int i = 0; i < t; i++) {
            xs[i] = base.get(i).x;
            ys[i] = base.get(i).y;
        }
        for (Share extra : list.subList(t, list.size())) {
            if (!Arrays.equals(interpolate(xs, ys, extra.x), extra.y)) {
                throw new ShamirException("share x=" + extra.x + " is inconsistent with the others");
            }
        }
        return interpolate(xs, ys, 0);
    }

    /** Lagrange interpolation of the polynomial through (xs[i], ys[i]) evaluated at {@code at}, per byte. */
    static byte[] interpolate(int[] xs, byte[][] ys, int at) {
        int t = xs.length;
        int[] weights = new int[t];
        for (int i = 0; i < t; i++) {
            int num = 1;
            int den = 1;
            for (int j = 0; j < t; j++) {
                if (i != j) {
                    num = Gf256.mul(num, Gf256.add(at, xs[j]));
                    den = Gf256.mul(den, Gf256.add(xs[i], xs[j]));
                }
            }
            weights[i] = Gf256.div(num, den);
        }
        byte[] out = new byte[ys[0].length];
        for (int k = 0; k < out.length; k++) {
            int acc = 0;
            for (int i = 0; i < t; i++) {
                acc = Gf256.add(acc, Gf256.mul(ys[i][k] & 0xff, weights[i]));
            }
            out[k] = (byte) acc;
        }
        return out;
    }
}
