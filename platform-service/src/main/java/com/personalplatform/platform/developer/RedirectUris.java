package com.personalplatform.platform.developer;

import com.personalplatform.platform.web.BadRequestException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Redirect targets an app may register: https anywhere, plain http only for a loopback host (local development). */
public final class RedirectUris {

    static final int MAX = 10;
    private static final Set<String> LOOPBACK = Set.of("localhost", "127.0.0.1");

    private RedirectUris() {}

    /** Distinct, in the order given. Throws {@link BadRequestException} for anything not allowed. */
    public static List<String> validate(List<String> uris) {
        if (uris == null || uris.isEmpty()) {
            return List.of();
        }
        if (uris.size() > MAX) {
            throw new BadRequestException("redirectUris allows at most " + MAX + " entries");
        }
        LinkedHashSet<String> distinct = new LinkedHashSet<>();
        for (String raw : uris) {
            String uri = raw == null ? "" : raw.strip();
            if (!allowed(uri)) {
                throw new BadRequestException("redirect URI '" + raw + "' must be https, or http on localhost, with no fragment");
            }
            distinct.add(uri);
        }
        return new ArrayList<>(distinct);
    }

    private static boolean allowed(String value) {
        if (value.isEmpty() || value.length() > 2048) {
            return false;
        }
        try {
            URI uri = new URI(value);
            if (uri.getFragment() != null || uri.getHost() == null) {
                return false;
            }
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            return "https".equals(scheme) || ("http".equals(scheme) && LOOPBACK.contains(uri.getHost()));
        } catch (URISyntaxException e) {
            return false;
        }
    }
}
