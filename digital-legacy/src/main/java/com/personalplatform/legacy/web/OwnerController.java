package com.personalplatform.legacy.web;

import com.personalplatform.legacy.protocol.SwitchPolicy;
import com.personalplatform.legacy.trustee.TrusteeAdminService;
import com.personalplatform.legacy.vault.VaultService;
import com.personalplatform.legacy.web.OwnerDtos.*;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
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

/** Owner API. The caller's Firebase uid is the only key to any data returned here. */
@RestController
@RequestMapping("/v1/legacy/vault")
public class OwnerController {

    private final VaultService vault;
    private final TrusteeAdminService trustees;

    public OwnerController(VaultService vault, TrusteeAdminService trustees) {
        this.vault = vault;
        this.trustees = trustees;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    VaultSummary create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateVaultRequest req) {
        return vault.create(jwt.getSubject(), req);
    }

    @PutMapping
    VaultSummary update(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateVaultRequest req) {
        return vault.update(jwt.getSubject(), req);
    }

    @GetMapping
    VaultSummary get(@AuthenticationPrincipal Jwt jwt) {
        return vault.get(jwt.getSubject());
    }

    @GetMapping("/ciphertext")
    CiphertextView ciphertext(@AuthenticationPrincipal Jwt jwt) {
        return vault.ciphertext(jwt.getSubject());
    }

    @PutMapping("/policy")
    StateView setPolicy(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SwitchPolicy policy) {
        return vault.setPolicy(jwt.getSubject(), policy);
    }

    @GetMapping("/state")
    StateView state(@AuthenticationPrincipal Jwt jwt) {
        return vault.state(jwt.getSubject());
    }

    @PostMapping("/arm")
    StateView arm(@AuthenticationPrincipal Jwt jwt) {
        return vault.arm(jwt.getSubject());
    }

    @PostMapping("/disarm")
    StateView disarm(@AuthenticationPrincipal Jwt jwt) {
        return vault.disarm(jwt.getSubject());
    }

    @PostMapping("/checkin")
    StateView checkIn(@AuthenticationPrincipal Jwt jwt) {
        return vault.checkIn(jwt.getSubject());
    }

    @PostMapping("/pause")
    StateView pause(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PauseRequest req) {
        return vault.pause(jwt.getSubject(), req.durationSeconds());
    }

    @PostMapping("/resume")
    StateView resume(@AuthenticationPrincipal Jwt jwt) {
        return vault.resume(jwt.getSubject());
    }

    @GetMapping("/timeline")
    List<TimelineEntry> timeline(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "100") int limit) {
        return vault.timeline(jwt.getSubject(), limit);
    }

    @GetMapping("/audit/verify")
    ChainView verify(@AuthenticationPrincipal Jwt jwt) {
        return vault.verifyAudit(jwt.getSubject());
    }

    // ---- trustees ----------------------------------------------------------------------------------------

    @PostMapping("/trustees")
    @ResponseStatus(HttpStatus.CREATED)
    InviteResponse invite(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody InviteRequest req) {
        return trustees.invite(jwt.getSubject(), req.label());
    }

    @GetMapping("/trustees")
    List<TrusteeView> listTrustees(@AuthenticationPrincipal Jwt jwt) {
        return trustees.list(jwt.getSubject());
    }

    @DeleteMapping("/trustees/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revoke(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        trustees.revoke(jwt.getSubject(), id);
    }

    @PutMapping("/trustees/{id}/share")
    TrusteeView uploadShare(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @Valid @RequestBody ShareUpload req) {
        return trustees.uploadShare(jwt.getSubject(), id, req);
    }
}
