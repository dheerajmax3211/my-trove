package com.personalplatform.waitingon.inbound;

import com.personalplatform.waitingon.inbound.InboundEmailService.InboundEmail;
import com.personalplatform.waitingon.inbound.InboundEmailService.Result;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Provider-agnostic inbound email webhook. Authenticated by {@link WebhookSecretFilter} (shared secret), not by a
 * Firebase token: the caller is an email provider, not a user. Map your provider's payload to this JSON shape
 * (a thin adapter, e.g. in a serverless function) or add a second controller for its native format.
 */
@RestController
@RequestMapping("/v1/webhooks")
public class InboundEmailController {

    public record InboundEmailRequest(
            @Size(max = 320) String from,
            @NotBlank @Size(max = 2000) String to,
            @Size(max = 500) String subject,
            @Size(max = 200_000) String text,
            @Size(max = 500) String messageId) {
    }

    private final InboundEmailService service;

    public InboundEmailController(InboundEmailService service) {
        this.service = service;
    }

    /** 202 even when no item matches, so provider retries do not pile up on unknown addresses. */
    @PostMapping("/inbound-email")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Result inbound(@Valid @RequestBody InboundEmailRequest r) {
        return service.handle(new InboundEmail(r.from(), r.to(), r.subject(), r.text(), r.messageId()));
    }
}
