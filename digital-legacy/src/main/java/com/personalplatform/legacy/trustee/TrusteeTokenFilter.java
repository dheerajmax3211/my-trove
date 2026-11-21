package com.personalplatform.legacy.trustee;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Authenticates {@code Authorization: Trustee <token>} for the trustee filter chain only. Not a Spring bean on
 * purpose: registering a Filter bean would add it to every chain (and the servlet container).
 */
public class TrusteeTokenFilter extends OncePerRequestFilter {

    static final String SCHEME = "Trustee ";

    private final TrusteePortalService portal;

    public TrusteeTokenFilter(TrusteePortalService portal) {
        this.portal = portal;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith(SCHEME)) {
            String token = header.substring(SCHEME.length()).strip();
            if (!token.isEmpty() && token.length() <= 200) {
                Optional<TrusteePrincipal> principal = portal.authenticate(token);
                principal.ifPresent(p -> SecurityContextHolder.getContext().setAuthentication(new TrusteeAuthentication(p)));
            }
        }
        chain.doFilter(request, response);
    }

    /** Authenticated trustee; deliberately NOT a JwtAuthenticationToken so it can never reach owner endpoints. */
    static final class TrusteeAuthentication extends AbstractAuthenticationToken {

        private final TrusteePrincipal principal;

        TrusteeAuthentication(TrusteePrincipal principal) {
            super(List.of(new SimpleGrantedAuthority("ROLE_TRUSTEE")));
            this.principal = principal;
            setAuthenticated(true);
        }

        @Override
        public Object getCredentials() {
            return "";
        }

        @Override
        public Object getPrincipal() {
            return principal;
        }
    }
}
