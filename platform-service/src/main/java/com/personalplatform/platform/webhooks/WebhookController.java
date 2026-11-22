package com.personalplatform.platform.webhooks;

import com.personalplatform.platform.developer.DeveloperIdentity;
import com.personalplatform.platform.webhooks.WebhookDtos.Created;
import com.personalplatform.platform.webhooks.WebhookDtos.CreateRequest;
import com.personalplatform.platform.webhooks.WebhookDtos.DeliveryView;
import com.personalplatform.platform.webhooks.WebhookDtos.EndpointView;
import com.personalplatform.platform.webhooks.WebhookDtos.EventView;
import com.personalplatform.platform.webhooks.WebhookDtos.SecretRotated;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Webhooks for the caller (design 5.2: {@code webhooks:manage}). Signing secrets appear only on create and rotate. */
@RestController
@RequestMapping("/v1/developer")
class WebhookController {

    private final WebhookService service;

    WebhookController(WebhookService service) {
        this.service = service;
    }

    @GetMapping("/webhook-events")
    @PreAuthorize("hasAuthority('webhooks:manage')")
    List<EventView> events() {
        return WebhookService.catalogue();
    }

    @PostMapping("/apps/{appId}/webhooks")
    @PreAuthorize("hasAuthority('webhooks:manage')")
    @ResponseStatus(HttpStatus.CREATED)
    Created create(@PathVariable UUID appId, @Valid @RequestBody CreateRequest request, @AuthenticationPrincipal Jwt jwt) {
        return service.create(DeveloperIdentity.owner(jwt), DeveloperIdentity.plan(jwt), appId, request);
    }

    @GetMapping("/apps/{appId}/webhooks")
    @PreAuthorize("hasAuthority('webhooks:manage')")
    List<EndpointView> list(@PathVariable UUID appId, @AuthenticationPrincipal Jwt jwt) {
        return service.list(DeveloperIdentity.owner(jwt), appId);
    }

    @DeleteMapping("/webhooks/{id}")
    @PreAuthorize("hasAuthority('webhooks:manage')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void disable(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        service.disable(DeveloperIdentity.owner(jwt), id);
    }

    @PostMapping("/webhooks/{id}/secret/rotate")
    @PreAuthorize("hasAuthority('webhooks:manage')")
    SecretRotated rotate(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return service.rotate(DeveloperIdentity.owner(jwt), id);
    }

    @GetMapping("/webhooks/{id}/deliveries")
    @PreAuthorize("hasAuthority('webhooks:manage')")
    List<DeliveryView> deliveries(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return service.deliveries(DeveloperIdentity.owner(jwt), id);
    }

    @PostMapping("/webhooks/{id}/deliveries/{deliveryId}/replay")
    @PreAuthorize("hasAuthority('webhooks:manage')")
    @ResponseStatus(HttpStatus.ACCEPTED)
    DeliveryView replay(@PathVariable UUID id, @PathVariable UUID deliveryId, @AuthenticationPrincipal Jwt jwt) {
        return service.replay(DeveloperIdentity.owner(jwt), id, deliveryId);
    }
}
