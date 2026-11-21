package com.personalplatform.consent.policy;

import java.util.regex.Pattern;

/**
 * A scope such as {@code profile.sizes:read}: a dotted attribute path plus an action. A scope covers its own path and
 * everything below it, matched on whole path SEGMENTS: {@code profile.sizes} covers {@code profile.sizes.shoe} but
 * never {@code profile.sizes_secret} or {@code profile.sizesX}.
 */
public record Scope(String path, String action) {

    public static final String READ = "read";
    private static final Pattern PATH = Pattern.compile("[a-z0-9_]+(\\.[a-z0-9_]+)*");
    private static final int MAX_PATH = 255;

    public Scope {
        if (!isValidPath(path)) {
            throw new IllegalArgumentException("Invalid scope path: '" + abbreviate(path) + "'");
        }
        if (!READ.equals(action)) {
            throw new IllegalArgumentException("Unsupported scope action (only 'read'): '" + abbreviate(action) + "'");
        }
    }

    public static Scope parse(String text) {
        if (text == null) {
            throw new IllegalArgumentException("Scope must not be null");
        }
        int idx = text.lastIndexOf(':');
        if (idx <= 0 || idx == text.length() - 1) {
            throw new IllegalArgumentException("Scope must look like 'path:read': '" + abbreviate(text) + "'");
        }
        return new Scope(text.substring(0, idx), text.substring(idx + 1));
    }

    public static boolean isValidPath(String path) {
        return path != null && path.length() <= MAX_PATH && PATH.matcher(path).matches();
    }

    /** True if {@code path} equals {@code ancestor} or lies strictly below it (whole-segment match). */
    public static boolean isSameOrDescendant(String ancestor, String path) {
        if (ancestor == null || path == null) {
            return false;
        }
        return path.equals(ancestor) || path.startsWith(ancestor + ".");
    }

    /** Does this scope grant access to the given attribute path? */
    public boolean covers(String attributePath) {
        return isSameOrDescendant(path, attributePath);
    }

    /** Is {@code other} fully inside this scope (same action, path equal or below)? */
    public boolean covers(Scope other) {
        return action.equals(other.action) && covers(other.path);
    }

    /** Could some attribute under {@code queryPath} be covered by this scope (or the scope be inside the query path)? */
    public boolean overlaps(String queryPath) {
        return covers(queryPath) || isSameOrDescendant(queryPath, path);
    }

    @Override
    public String toString() {
        return path + ":" + action;
    }

    private static String abbreviate(String s) {
        if (s == null) {
            return "null";
        }
        return s.length() > 40 ? s.substring(0, 40) + "..." : s;
    }
}
