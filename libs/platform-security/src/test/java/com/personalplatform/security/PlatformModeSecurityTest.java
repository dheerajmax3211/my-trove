package com.personalplatform.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.personalplatform.security.testing.PlatformTestTokens;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** Whole auto-configured stack in {@code app.security.mode=platform}: real decoder, real JWKS fetch, real chain. */
@SpringBootTest(
        classes = SecuredTestApp.class,
        properties = {"app.security.mode=platform", "app.platform.issuer=http://localhost:8081"})
@AutoConfigureMockMvc
class PlatformModeSecurityTest {

    static final PlatformTestTokens TOKENS = PlatformTestTokens.create("it-key");
    static final JwksServer JWKS = new JwksServer(TOKENS);

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("app.platform.jwk-set-uri", JWKS::url);
    }

    @AfterAll
    static void stop() {
        JWKS.close();
    }

    @Autowired
    MockMvc mvc;

    private static String bearer(String token) {
        return "Bearer " + token;
    }

    @Test
    void validTokenAuthenticatesAndExposesClaimsAsAuthorities() throws Exception {
        String token = TOKENS.platformToken("uid-1")
                .roles("ADMIN")
                .permissions("users:read", "usage:read:all")
                .build();

        mvc.perform(get("/whoami").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("uid-1"))
                .andExpect(jsonPath("$.authorities[0]").value("ROLE_ADMIN"))
                .andExpect(jsonPath("$.authorities[1]").value("usage:read:all"))
                .andExpect(jsonPath("$.authorities[2]").value("users:read"));
    }

    @Test
    void requiresPermissionReturns403WithoutTheAuthority() throws Exception {
        String token = TOKENS.platformToken("uid-2")
                .roles("MEMBER")
                .permissions("products:use", "usage:read:self")
                .build();

        mvc.perform(get("/usage").header("Authorization", bearer(token))).andExpect(status().isForbidden());
    }

    @Test
    void requiresPermissionReturns200WithTheAuthority() throws Exception {
        String token = TOKENS.platformToken("uid-3")
                .roles("AUDITOR")
                .permissions("usage:read:all")
                .build();

        mvc.perform(get("/usage").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(content().string("usage"));
    }

    @Test
    void aRoleNameIsNotAPermission() throws Exception {
        String token = TOKENS.platformToken("uid-4").roles("OWNER").build();

        mvc.perform(get("/usage").header("Authorization", bearer(token))).andExpect(status().isForbidden());
    }

    @Test
    void servicePrincipalScopesBecomeScopeAuthorities() throws Exception {
        String allowed = TOKENS.serviceToken("app-1").scopes("data:read").build();
        String denied = TOKENS.serviceToken("app-2").scopes("data:write").build();

        mvc.perform(get("/scoped").header("Authorization", bearer(allowed))).andExpect(status().isOk());
        mvc.perform(get("/scoped").header("Authorization", bearer(denied))).andExpect(status().isForbidden());
        mvc.perform(get("/usage").header("Authorization", bearer(allowed))).andExpect(status().isForbidden());
    }

    @Test
    void missingTokenIs401() throws Exception {
        mvc.perform(get("/usage")).andExpect(status().isUnauthorized());
    }

    @Test
    void forgedTokensAre401NotJustForbidden() throws Exception {
        PlatformTestTokens attacker = PlatformTestTokens.create("it-key");
        String[] forged = {
            TOKENS.platformToken("x").permissions("usage:read:all").buildUnsigned(),
            attacker.platformToken("x").permissions("usage:read:all").build(),
            TOKENS.platformToken("x").permissions("usage:read:all").audience("other").build(),
            TOKENS.platformToken("x").permissions("usage:read:all").issuer("http://evil.example").build(),
            TOKENS.platformToken("x")
                    .permissions("usage:read:all")
                    .issuedAt(java.time.Instant.now().minusSeconds(7200))
                    .expiresAt(java.time.Instant.now().minusSeconds(3600))
                    .build()
        };
        for (String token : forged) {
            mvc.perform(get("/usage").header("Authorization", bearer(token))).andExpect(status().isUnauthorized());
        }
    }
}
