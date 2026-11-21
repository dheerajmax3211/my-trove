package com.personalplatform.platform.flags;

import com.personalplatform.platform.flags.Dtos.Flag;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;

/**
 * Decides whether one flag is on for one caller. A flag is on when it is enabled, the caller's plan is allowed (no list
 * means any plan), the caller holds at least one allowed role (no list means any role), and the caller's rollout bucket
 * is below {@code rolloutPercent}. Pure and stateless: the same inputs always give the same answer.
 */
public final class FlagEvaluator {

    /** The facts about the caller a flag can depend on, all taken from the platform token. */
    public record Caller(String uid, String plan, List<String> roles) {
    }

    private FlagEvaluator() {
    }

    /**
     * The caller's rollout bucket for one flag, 0 to 99: the first four bytes of SHA-256 of {@code uid + ":" + key} read as
     * an unsigned big-endian integer, modulo 100. Including the key makes buckets independent between flags, so one flag's
     * 10% is not always the same 10% of users. Part of the contract: change it and every rollout reshuffles.
     */
    public static int bucket(String uid, String key) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest((uid + ":" + key).getBytes(StandardCharsets.UTF_8));
            long unsigned = ((h[0] & 0xFFL) << 24) | ((h[1] & 0xFFL) << 16) | ((h[2] & 0xFFL) << 8) | (h[3] & 0xFFL);
            return (int) (unsigned % 100);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required by the JDK", e);
        }
    }

    static boolean isOn(Flag flag, Caller caller) {
        if (!flag.enabled()) {
            return false;
        }
        if (!flag.allowedPlans().isEmpty() && (caller.plan() == null || !flag.allowedPlans().contains(caller.plan()))) {
            return false;
        }
        if (!flag.allowedRoles().isEmpty() && flag.allowedRoles().stream().noneMatch(caller.roles()::contains)) {
            return false;
        }
        return bucket(caller.uid(), flag.key()) < flag.rolloutPercent();
    }
}
