package com.personalplatform.homepulse.device;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DeviceController {

    public record RegisterRequest(@NotBlank @Size(max = 120) String label) {}

    /** {@code manual}: readings entered by the owner, which have no token. {@code tokenPrefix} is a placeholder then. */
    public record DeviceResponse(UUID id, UUID applianceId, String label, String tokenPrefix, Instant createdAt,
                                 Instant lastSeenAt, Instant revokedAt, boolean active, boolean simulated, boolean manual) {
        static DeviceResponse from(Device d) {
            return new DeviceResponse(d.id(), d.applianceId(), d.label(), d.tokenPrefix(), d.createdAt(),
                    d.lastSeenAt(), d.revokedAt(), d.active(), d.simulated(), d.manual());
        }
    }

    /** {@code ingestionToken} is shown exactly once; only its hash is stored. */
    public record RegisteredResponse(DeviceResponse device, String ingestionToken) {}

    private final DeviceService service;

    public DeviceController(DeviceService service) {
        this.service = service;
    }

    @PostMapping("/v1/appliances/{applianceId}/devices")
    @ResponseStatus(HttpStatus.CREATED)
    RegisteredResponse register(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID applianceId,
                                @Valid @RequestBody RegisterRequest body) {
        var r = service.register(jwt.getSubject(), applianceId, body.label());
        return new RegisteredResponse(DeviceResponse.from(r.device()), r.ingestionToken());
    }

    @GetMapping("/v1/appliances/{applianceId}/devices")
    List<DeviceResponse> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID applianceId) {
        return service.list(jwt.getSubject(), applianceId).stream().map(DeviceResponse::from).toList();
    }

    @DeleteMapping("/v1/devices/{deviceId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revoke(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID deviceId) {
        service.revoke(jwt.getSubject(), deviceId);
    }
}
