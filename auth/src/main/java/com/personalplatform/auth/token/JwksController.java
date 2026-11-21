package com.personalplatform.auth.token;

import java.time.Duration;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public JWKS: lets every service verify platform tokens offline. Contains public keys only. */
@RestController
public class JwksController {

    private final SigningKeyService keys;

    public JwksController(SigningKeyService keys) {
        this.keys = keys;
    }

    @GetMapping("/.well-known/jwks.json")
    public ResponseEntity<Map<String, Object>> jwks() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .body(keys.verificationJwkSet().toPublicJWKSet().toJSONObject());
    }
}
