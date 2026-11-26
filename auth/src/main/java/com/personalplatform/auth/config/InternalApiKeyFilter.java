package com.personalplatform.auth.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Service-to-service authentication for auth's {@code /internal/**} (the delegated-token endpoint): the caller presents
 * the shared {@code APP_INTERNAL_API_KEY} in {@code X-Internal-Key}. A match authenticates as {@code ROLE_INTERNAL};
 * anything else stays anonymous and the chain answers 401. A blank configured key denies everything. Compared in
 * constant time on equal-length digests (same rules as platform-service's filter).
 */
public class InternalApiKeyFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Internal-Key";

    private final byte[] expectedDigest;

    public InternalApiKeyFilter(String configuredKey) {
        this.expectedDigest = configuredKey == null || configuredKey.isBlank() ? null : sha256(configuredKey);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String presented = request.getHeader(HEADER);
        if (expectedDigest != null && presented != null && MessageDigest.isEqual(expectedDigest, sha256(presented))) {
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                    "internal", null, List.of(new SimpleGrantedAuthority("ROLE_INTERNAL"))));
            SecurityContextHolder.setContext(context);
        }
        chain.doFilter(request, response);
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
