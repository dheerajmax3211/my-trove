package com.personalplatform.gateway.security;

import java.util.Locale;

/** Path hygiene applied before any routing or passthrough decision. */
final class RequestPaths {

    private RequestPaths() {}

    /**
     * True for paths that mean different things to the gateway and to the service behind it: dot segments, encoded
     * dots, slashes or backslashes, path parameters, doubled slashes, NUL. A passthrough rule such as
     * {@code /v1/ingest/**} must not be reachable by {@code /v1/ingest/../items}.
     */
    static boolean ambiguous(String rawPath) {
        String lower = rawPath.toLowerCase(Locale.ROOT);
        if (lower.contains("%2e") || lower.contains("%2f") || lower.contains("%5c") || lower.contains("%00")
                || lower.contains(";") || lower.contains("\\") || lower.contains("//")) {
            return true;
        }
        for (String segment : lower.split("/", -1)) {
            if (segment.equals(".") || segment.equals("..")) {
                return true;
            }
        }
        return false;
    }

    /** The path the service sees: the raw path without {@code /api/<service>}; {@code /} when nothing is left. */
    static String downstream(String rawPath, String service) {
        String prefix = "/api/" + service;
        if (!rawPath.startsWith(prefix)) {
            return rawPath;
        }
        String rest = rawPath.substring(prefix.length());
        return rest.isEmpty() ? "/" : rest;
    }
}
