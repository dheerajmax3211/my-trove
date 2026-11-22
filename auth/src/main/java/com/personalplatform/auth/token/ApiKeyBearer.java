package com.personalplatform.auth.token;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Optional;
import org.springframework.http.HttpHeaders;

/** Recognises an API key presented as {@code Authorization: Bearer pk_...} on the token exchange. */
public final class ApiKeyBearer {

    public static final String PREFIX = "pk_";
    static final String EXCHANGE_PATH = "/v1/token/exchange";
    private static final String BEARER = "Bearer ";

    private ApiKeyBearer() {}

    /** The presented key, or empty when the header carries no API key. */
    public static Optional<String> presented(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || header.length() <= BEARER.length() || !header.regionMatches(true, 0, BEARER, 0, BEARER.length())) {
            return Optional.empty();
        }
        String token = header.substring(BEARER.length()).strip();
        return token.startsWith(PREFIX) ? Optional.of(token) : Optional.empty();
    }

    /** True for a POST to the token exchange that presents an API key (the only request this path serves). */
    public static boolean isApiKeyExchange(HttpServletRequest request) {
        return "POST".equalsIgnoreCase(request.getMethod()) && EXCHANGE_PATH.equals(request.getRequestURI())
                && presented(request).isPresent();
    }
}
