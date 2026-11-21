package com.personalplatform.consent.client;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Owner registers and manages the apps that may ask for access to the owner's vault. */
@RestController
@RequestMapping("/v1/owner/clients")
public class ClientController {

    public record RegisterClient(
            @NotBlank @Size(max = 120) String name,
            @Email @Size(max = 320) String contactEmail,
            @Size(max = 1000) String redirectUri,
            @NotEmpty @Size(max = 50) List<@NotBlank @Size(max = 270) String> allowedScopes) {}

    public record ClientView(
            String clientId,
            String name,
            String contactEmail,
            String redirectUri,
            List<String> allowedScopes,
            Instant createdAt,
            Instant secretRotatedAt,
            Instant disabledAt) {
        static ClientView of(ClientRecord c) {
            return new ClientView(c.clientId(), c.name(), c.contactEmail(), c.redirectUri(), c.allowedScopes(),
                    c.createdAt(), c.secretRotatedAt(), c.disabledAt());
        }
    }

    /** Returned once. The gateway keeps only a hash; a lost secret must be rotated. */
    public record ClientWithSecretView(ClientView client, String clientSecret) {}

    private final ClientService clients;

    public ClientController(ClientService clients) {
        this.clients = clients;
    }

    @PostMapping
    public ResponseEntity<ClientWithSecretView> register(
            @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody RegisterClient body) {
        var created = clients.register(jwt.getSubject(), body.name(), body.contactEmail(), body.redirectUri(), body.allowedScopes());
        return ResponseEntity.status(HttpStatus.CREATED)
                .header("Cache-Control", "no-store")
                .body(new ClientWithSecretView(ClientView.of(created.client()), created.clientSecret()));
    }

    @GetMapping
    public List<ClientView> list(@AuthenticationPrincipal Jwt jwt) {
        return clients.list(jwt.getSubject()).stream().map(ClientView::of).toList();
    }

    @GetMapping("/{clientId}")
    public ClientView get(@AuthenticationPrincipal Jwt jwt, @PathVariable String clientId) {
        return ClientView.of(clients.get(jwt.getSubject(), clientId));
    }

    @PostMapping("/{clientId}/rotate-secret")
    public ResponseEntity<ClientWithSecretView> rotate(@AuthenticationPrincipal Jwt jwt, @PathVariable String clientId) {
        var rotated = clients.rotateSecret(jwt.getSubject(), clientId);
        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .body(new ClientWithSecretView(ClientView.of(rotated.client()), rotated.clientSecret()));
    }

    @DeleteMapping("/{clientId}")
    @org.springframework.web.bind.annotation.ResponseStatus(HttpStatus.NO_CONTENT)
    public void disable(@AuthenticationPrincipal Jwt jwt, @PathVariable String clientId) {
        clients.disable(jwt.getSubject(), clientId);
    }
}
