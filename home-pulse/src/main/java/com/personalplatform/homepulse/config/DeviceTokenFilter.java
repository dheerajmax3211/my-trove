package com.personalplatform.homepulse.config;

import com.personalplatform.homepulse.device.DeviceService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Authenticates {@code Authorization: Bearer hpd_...} against the stored token hashes. On any failure it simply
 * leaves the request unauthenticated; the chain's entry point answers 401 (no information about why).
 */
final class DeviceTokenFilter extends OncePerRequestFilter {

    private static final String BEARER = "Bearer ";
    private final DeviceService devices;

    DeviceTokenFilter(DeviceService devices) {
        this.devices = devices;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.regionMatches(true, 0, BEARER, 0, BEARER.length())) {
            String token = header.substring(BEARER.length()).trim();
            devices.authenticate(token).ifPresent(principal -> {
                SecurityContext context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(new DeviceAuthentication(principal));
                SecurityContextHolder.setContext(context);
            });
        }
        chain.doFilter(request, response);
    }
}
