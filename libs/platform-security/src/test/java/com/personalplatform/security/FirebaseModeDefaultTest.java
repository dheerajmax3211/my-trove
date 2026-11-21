package com.personalplatform.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.personalplatform.security.testing.PlatformTestTokens;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * No {@code app.security.mode} set: the default must stay Firebase, so every existing service behaves as before.
 * Firebase keys are served from the in-process JWKS so the real Firebase decoder runs.
 */
@SpringBootTest(classes = SecuredTestApp.class, properties = "app.firebase.project-id=test-project")
@AutoConfigureMockMvc
class FirebaseModeDefaultTest {

    static final PlatformTestTokens TOKENS = PlatformTestTokens.create("fb-key");
    static final JwksServer JWKS = new JwksServer(TOKENS);

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("app.firebase.jwk-set-uri", JWKS::url);
    }

    @AfterAll
    static void stop() {
        JWKS.close();
    }

    @Autowired
    MockMvc mvc;

    private static String firebaseToken(String uid) {
        return TOKENS.platformToken(uid)
                .issuer("https://securetoken.google.com/test-project")
                .audience("test-project")
                .tokenUse(null)
                .build();
    }

    @Test
    void firebaseTokenIsAccepted() throws Exception {
        mvc.perform(get("/whoami").header("Authorization", "Bearer " + firebaseToken("uid-1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("uid-1"))
                .andExpect(jsonPath("$.authorities").isEmpty());
    }

    @Test
    void platformTokenIsNotAcceptedInFirebaseMode() throws Exception {
        String platform = TOKENS.platformToken("uid-1").permissions("usage:read:all").build();

        mvc.perform(get("/whoami").header("Authorization", "Bearer " + platform)).andExpect(status().isUnauthorized());
    }

    @Test
    void permissionClaimsInAFirebaseTokenAreNotTrusted() throws Exception {
        String token = TOKENS.platformToken("uid-1")
                .issuer("https://securetoken.google.com/test-project")
                .audience("test-project")
                .tokenUse(null)
                .permissions("usage:read:all")
                .roles("OWNER")
                .build();

        mvc.perform(get("/usage").header("Authorization", "Bearer " + token)).andExpect(status().isForbidden());
    }

    @Test
    void methodSecurityDoesNotDisturbUnannotatedEndpoints() throws Exception {
        mvc.perform(get("/whoami")).andExpect(status().isUnauthorized());
        mvc.perform(get("/whoami").header("Authorization", "Bearer " + firebaseToken("uid-9")))
                .andExpect(status().isOk());
    }
}
