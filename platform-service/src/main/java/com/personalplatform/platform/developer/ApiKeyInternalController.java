package com.personalplatform.platform.developer;

import com.personalplatform.platform.developer.ApiKeyDtos.Verified;
import com.personalplatform.platform.developer.ApiKeyDtos.VerifyRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Service-to-service verification of a presented API key, called by the auth service during token exchange. Guarded by
 * the internal chain ({@code X-Internal-Key}); never reachable through the gateway ({@code /internal/**} is blocked).
 */
@RestController
@RequestMapping("/internal/v1/api-keys")
class ApiKeyInternalController {

    private final ApiKeyService service;

    ApiKeyInternalController(ApiKeyService service) {
        this.service = service;
    }

    @PostMapping("/verify")
    Verified verify(@Valid @RequestBody VerifyRequest request) {
        return service.verify(request.key());
    }

    /** A key's current state by id, for auth's delegated-token check ({@code POST /internal/v1/token/delegate}). */
    @PostMapping("/status")
    ApiKeyDtos.KeyStatus status(@Valid @RequestBody ApiKeyDtos.StatusRequest request) {
        return service.status(request.keyId());
    }
}
