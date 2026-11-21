package com.personalplatform.waitingon.inbound;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Shared-secret authentication for server-to-server webhooks: the provider sends {@code X-Webhook-Secret}.
 * Constant-time comparison; a blank configured secret rejects everything (fail closed).
 */
public class WebhookSecretFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Webhook-Secret";

    private final byte[] expected;

    public WebhookSecretFilter(String secret) {
        this.expected = secret == null ? new byte[0] : secret.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String presented = req.getHeader(HEADER);
        boolean ok = expected.length > 0 && presented != null
                && MessageDigest.isEqual(expected, presented.getBytes(StandardCharsets.UTF_8));
        if (!ok) {
            res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            res.setContentType("application/problem+json");
            res.getWriter().write("{\"type\":\"about:blank\",\"title\":\"Unauthorized\",\"status\":401,"
                    + "\"detail\":\"Missing or invalid webhook secret\"}");
            return;
        }
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated("inbound-webhook", null,
                        AuthorityUtils.createAuthorityList("ROLE_WEBHOOK")));
        chain.doFilter(req, res);
    }
}
