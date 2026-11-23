package com.personalplatform.platform.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Runs without Docker: only the security chains, no database or Kafka. */
@WebMvcTest(controllers = ActuatorChainTest.Probe.class, properties = {"management.server.port=0", "app.internal.api-key=k"})
@Import(SecurityConfig.class)
class ActuatorChainTest {

    @Autowired MockMvc mvc;
    @MockitoBean JwtDecoder jwtDecoder;

    @Test
    void theMainPortStillRefusesPrometheusWithoutAToken() throws Exception {
        mvc.perform(get("/actuator/prometheus")).andExpect(status().isUnauthorized());
    }

    @Test
    void theApiStillNeedsAToken() throws Exception {
        mvc.perform(get("/v1/probe")).andExpect(status().isUnauthorized());
    }

    @RestController
    static class Probe {
        @GetMapping("/v1/probe")
        String probe() {
            return "ok";
        }
    }
}
