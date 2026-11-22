package com.personalplatform.platform.developer;

import com.personalplatform.platform.developer.DeveloperAppDtos.App;
import com.personalplatform.platform.developer.DeveloperAppDtos.AppRequest;
import com.personalplatform.platform.developer.DeveloperAppDtos.Created;
import com.personalplatform.platform.developer.DeveloperAppDtos.SecretRotated;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Developer apps for the caller (design 5.2: {@code apps:manage}). The client secret appears only in the responses to
 * create and rotate; every other read omits it.
 */
@RestController
@RequestMapping("/v1/developer/apps")
class DeveloperAppController {

    private final DeveloperAppService service;

    DeveloperAppController(DeveloperAppService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('apps:manage')")
    List<App> list(@AuthenticationPrincipal Jwt jwt) {
        return service.list(DeveloperIdentity.owner(jwt));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('apps:manage')")
    @ResponseStatus(HttpStatus.CREATED)
    Created create(@Valid @RequestBody AppRequest request, @AuthenticationPrincipal Jwt jwt) {
        return service.create(DeveloperIdentity.owner(jwt), request);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('apps:manage')")
    App get(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return service.get(DeveloperIdentity.owner(jwt), id);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('apps:manage')")
    App update(@PathVariable UUID id, @Valid @RequestBody AppRequest request, @AuthenticationPrincipal Jwt jwt) {
        return service.update(DeveloperIdentity.owner(jwt), id, request);
    }

    @PostMapping("/{id}/client-secret/rotate")
    @PreAuthorize("hasAuthority('apps:manage')")
    SecretRotated rotate(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return service.rotate(DeveloperIdentity.owner(jwt), id);
    }

    @PostMapping("/{id}/client-secret/revoke")
    @PreAuthorize("hasAuthority('apps:manage')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revokeSecret(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        service.revokeSecret(DeveloperIdentity.owner(jwt), id);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('apps:manage')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        service.delete(DeveloperIdentity.owner(jwt), id);
    }
}
