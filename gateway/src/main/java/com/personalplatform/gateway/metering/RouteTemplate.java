package com.personalplatform.gateway.metering;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Bounded-cardinality route name for analytics: the first two path segments after {@code /api/<service>}, with
 * anything that looks like an identifier replaced by {@code {id}}. The gateway does not know the services' own route
 * patterns, so it never reports more than that; query strings are dropped.
 */
public final class RouteTemplate {

    private static final Pattern PLAIN = Pattern.compile("[A-Za-z0-9._~-]+");
    private static final Pattern ALL_DIGITS = Pattern.compile("\\d+");
    private static final Pattern HEX_RUN = Pattern.compile("[0-9a-fA-F-]{12,}");
    private static final int MAX_SEGMENT = 24;

    private RouteTemplate() {}

    public static String of(String rawPath, String service) {
        String path = rawPath;
        int query = path.indexOf('?');
        if (query >= 0) {
            path = path.substring(0, query);
        }
        String prefix = "/api/" + service;
        if (path.startsWith(prefix)) {
            path = path.substring(prefix.length());
        }
        List<String> kept = new ArrayList<>(2);
        for (String segment : path.split("/")) {
            if (segment.isEmpty()) {
                continue;
            }
            kept.add(idLike(segment) ? "{id}" : segment);
            if (kept.size() == 2) {
                break;
            }
        }
        return kept.isEmpty() ? "/" : "/" + String.join("/", kept);
    }

    private static boolean idLike(String segment) {
        if (!PLAIN.matcher(segment).matches() || segment.length() > MAX_SEGMENT) {
            return true; // encoded bytes, e-mail addresses, long tokens
        }
        if (ALL_DIGITS.matcher(segment).matches() || HEX_RUN.matcher(segment).matches()) {
            return true;
        }
        return segment.length() >= 16 && segment.chars().anyMatch(Character::isDigit);
    }
}
