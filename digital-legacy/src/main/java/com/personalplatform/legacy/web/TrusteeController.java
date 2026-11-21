package com.personalplatform.legacy.web;

import com.personalplatform.legacy.trustee.TrusteePortalService;
import com.personalplatform.legacy.trustee.TrusteePrincipal;
import com.personalplatform.legacy.web.TrusteeDtos.*;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Trustee API, authenticated by trustee tokens (see SecurityConfig). Responses are scoped to the token's trustee. */
@RestController
@RequestMapping("/v1/legacy/trustee")
public class TrusteeController {

    private final TrusteePortalService portal;

    public TrusteeController(TrusteePortalService portal) {
        this.portal = portal;
    }

    @PostMapping("/accept")
    @ResponseStatus(HttpStatus.CREATED)
    AcceptResponse accept(@Valid @RequestBody AcceptRequest req) {
        return portal.accept(req);
    }

    @GetMapping("/me")
    TrusteeStateView me(@AuthenticationPrincipal TrusteePrincipal p) {
        return portal.me(p);
    }

    @PostMapping("/share/confirm")
    TrusteeStateView confirm(@AuthenticationPrincipal TrusteePrincipal p, @Valid @RequestBody ConfirmRequest req) {
        return portal.confirm(p, req.shareDigest());
    }

    @PostMapping("/approval")
    VoteResponse vote(@AuthenticationPrincipal TrusteePrincipal p, @Valid @RequestBody VoteRequest req) {
        return portal.vote(p, req.decision());
    }

    @GetMapping("/share")
    ShareView share(@AuthenticationPrincipal TrusteePrincipal p) {
        return portal.fetchShare(p);
    }

    @GetMapping("/ciphertext")
    CiphertextView ciphertext(@AuthenticationPrincipal TrusteePrincipal p) {
        return portal.fetchCiphertext(p);
    }
}
