package com.personalplatform.platform.developer;

import com.personalplatform.platform.developer.ApiKeyDtos.Issued;
import com.personalplatform.platform.developer.ApiKeyDtos.IssueRequest;
import com.personalplatform.platform.developer.ApiKeyDtos.KeyView;
import com.personalplatform.platform.developer.ApiKeyDtos.ScopeView;
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

/** API keys and the scope catalogue for the caller (design 5.2: {@code keys:manage}). */
@RestController
@RequestMapping("/v1/developer")
class ApiKeyController {

    private final ApiKeyService service;

    ApiKeyController(ApiKeyService service) {
        this.service = service;
    }

    @PostMapping("/apps/{appId}/keys")
    @PreAuthorize("hasAuthority('keys:manage')")
    @ResponseStatus(HttpStatus.CREATED)
    Issued issue(@PathVariable UUID appId, @Valid @RequestBody IssueRequest request, @AuthenticationPrincipal Jwt jwt) {
        return service.issue(DeveloperIdentity.owner(jwt), DeveloperIdentity.plan(jwt), appId, request);
    }

    @GetMapping("/apps/{appId}/keys")
    @PreAuthorize("hasAuthority('keys:manage')")
    List<KeyView> list(@PathVariable UUID appId, @AuthenticationPrincipal Jwt jwt) {
        return service.list(DeveloperIdentity.owner(jwt), appId);
    }

    @DeleteMapping("/keys/{keyId}")
    @PreAuthorize("hasAuthority('keys:manage')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revoke(@PathVariable UUID keyId, @AuthenticationPrincipal Jwt jwt) {
        service.revoke(DeveloperIdentity.owner(jwt), keyId);
    }

    @GetMapping("/scopes")
    @PreAuthorize("hasAuthority('keys:manage')")
    List<ScopeView> scopes() {
        return ScopeCatalogue.ALL.stream()
                .map(s -> new ScopeView(s.name(), s.description(), s.permissions()))
                .toList();
    }
}
