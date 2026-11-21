package com.personalplatform.platform.config;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

class InternalApiKeyFilterTest {

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    /** Runs the filter and returns whether the request ended up authenticated while the chain ran. */
    private static boolean authenticated(String configuredKey, String header) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/internal/v1/plans");
        if (header != null) {
            request.addHeader("X-Internal-Key", header);
        }
        boolean[] seen = new boolean[1];
        FilterChain chain = (req, res) -> {
            var auth = SecurityContextHolder.getContext().getAuthentication();
            seen[0] = auth != null && auth.isAuthenticated()
                    && auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_INTERNAL"));
        };
        new InternalApiKeyFilter(configuredKey).doFilter(request, new MockHttpServletResponse(), chain);
        return seen[0];
    }

    @Test
    void theConfiguredKeyAuthenticatesTheRequest() throws Exception {
        assertThat(authenticated("s3cret", "s3cret")).isTrue();
    }

    @Test
    void anyOtherValueDoesNot() throws Exception {
        assertThat(authenticated("s3cret", "s3cre")).isFalse();
        assertThat(authenticated("s3cret", "s3cret ")).isFalse();
        assertThat(authenticated("s3cret", "S3CRET")).isFalse();
        assertThat(authenticated("s3cret", "")).isFalse();
        assertThat(authenticated("s3cret", null)).isFalse();
    }

    @Test
    void aBlankConfiguredKeyDeniesEverythingEvenABlankHeader() throws Exception {
        assertThat(authenticated("", "")).isFalse();
        assertThat(authenticated("", " ")).isFalse();
        assertThat(authenticated(null, null)).isFalse();
        assertThat(authenticated("   ", "   ")).isFalse();
        assertThat(authenticated("", "anything")).isFalse();
    }
}
