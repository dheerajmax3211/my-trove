package com.personalplatform.consent.vault;

import com.personalplatform.consent.policy.Sensitivity;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** Owner-only attribute CRUD. The owner is always the authenticated Firebase uid; it is never taken from the request. */
@RestController
@RequestMapping("/v1/owner/vault/attributes")
public class VaultController {

    public record CreateAttribute(
            @NotBlank @Size(max = 255) String keyPath, @NotNull JsonNode value, @NotNull Sensitivity sensitivity) {}

    public record ReplaceAttribute(@NotNull JsonNode value, @NotNull Sensitivity sensitivity) {}

    public record AttributeView(
            String keyPath, JsonNode value, Sensitivity sensitivity, Instant createdAt, Instant updatedAt) {
        static AttributeView of(AttributeRecord r) {
            return new AttributeView(r.keyPath(), r.value(), r.sensitivity(), r.createdAt(), r.updatedAt());
        }
    }

    private final VaultService vault;

    public VaultController(VaultService vault) {
        this.vault = vault;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AttributeView create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateAttribute body) {
        return AttributeView.of(vault.create(jwt.getSubject(), body.keyPath(), body.value(), body.sensitivity()));
    }

    @GetMapping
    public List<AttributeView> list(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) String prefix) {
        return vault.list(jwt.getSubject(), prefix).stream().map(AttributeView::of).toList();
    }

    @GetMapping("/{keyPath}")
    public AttributeView get(@AuthenticationPrincipal Jwt jwt, @PathVariable String keyPath) {
        return AttributeView.of(vault.get(jwt.getSubject(), keyPath));
    }

    @PutMapping("/{keyPath}")
    public AttributeView replace(
            @AuthenticationPrincipal Jwt jwt, @PathVariable String keyPath, @Valid @RequestBody ReplaceAttribute body) {
        return AttributeView.of(vault.replace(jwt.getSubject(), keyPath, body.value(), body.sensitivity()));
    }

    @DeleteMapping("/{keyPath}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable String keyPath) {
        vault.delete(jwt.getSubject(), keyPath);
    }
}
