package com.personalplatform.legacy.crypto;

/**
 * Arithmetic in GF(2^8) with the AES reduction polynomial x^8 + x^4 + x^3 + x + 1 (0x11b), using
 * log/antilog tables built from the generator 3. Addition and subtraction are both XOR.
 *
 * <p>Table lookups are not constant-time; Shamir sharing runs on the client in the intended deployment and
 * the secret is a random vault key, so cache-timing on a client machine is out of scope (see README).
 */
final class Gf256 {

    private static final int[] EXP = new int[510];
    private static final int[] LOG = new int[256];

    static {
        int x = 1;
        for (int i = 0; i < 255; i++) {
            EXP[i] = x;
            LOG[x] = i;
            x = x ^ xtime(x); // multiply by the generator 3
        }
        for (int i = 255; i < 510; i++) {
            EXP[i] = EXP[i - 255];
        }
    }

    private Gf256() {}

    private static int xtime(int x) {
        int r = x << 1;
        if ((r & 0x100) != 0) {
            r ^= 0x11b;
        }
        return r & 0xff;
    }

    static int add(int a, int b) {
        return (a ^ b) & 0xff;
    }

    static int mul(int a, int b) {
        if (a == 0 || b == 0) {
            return 0;
        }
        return EXP[LOG[a & 0xff] + LOG[b & 0xff]];
    }

    static int inv(int a) {
        if ((a & 0xff) == 0) {
            throw new ArithmeticException("0 has no multiplicative inverse in GF(256)");
        }
        return EXP[255 - LOG[a & 0xff]];
    }

    static int div(int a, int b) {
        return mul(a, inv(b));
    }
}
