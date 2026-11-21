package com.personalplatform.platform.flags;

import com.personalplatform.platform.flags.Dtos.Evaluation;
import com.personalplatform.platform.flags.Dtos.Flag;
import com.personalplatform.platform.flags.Dtos.FlagRequest;
import com.personalplatform.platform.flags.FlagEvaluator.Caller;
import com.personalplatform.platform.web.BadRequestException;
import jakarta.validation.Valid;
import java.util.List;
import java.util.regex.Pattern;
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
import org.springframework.web.server.ResponseStatusException;

/**
 * Feature flags. Administration needs {@code flags:manage} (ADMIN and OWNER, design 5.2); {@code /evaluate} is open to any
 * authenticated principal and answers for the caller only, from the token's {@code uid} (the subject when absent),
 * {@code plan} and {@code roles} claims. Changes are written to the append-only {@code platform.flag_audit} table.
 */
@RestController
@RequestMapping("/v1/flags")
class FlagController {

    private static final Pattern KEY = Pattern.compile(Dtos.KEY_PATTERN);

    private final FlagService service;

    FlagController(FlagService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('flags:manage')")
    List<Flag> list() {
        return service.list();
    }

    @PostMapping
    @PreAuthorize("hasAuthority('flags:manage')")
    @ResponseStatus(HttpStatus.CREATED)
    Flag create(@Valid @RequestBody FlagRequest request, @AuthenticationPrincipal Jwt jwt) {
        if (request.key() == null || request.key().isEmpty()) {
            throw new BadRequestException("key is required");
        }
        return service.create(request, identity(jwt));
    }

    @PutMapping("/{key}")
    @PreAuthorize("hasAuthority('flags:manage')")
    Flag update(@PathVariable String key, @Valid @RequestBody FlagRequest request, @AuthenticationPrincipal Jwt jwt) {
        if (!KEY.matcher(key).matches()) {
            throw new BadRequestException("key is not a valid flag key");
        }
        if (request.key() != null && !request.key().equals(key)) {
            throw new BadRequestException("key in the body does not match the path");
        }
        return service.update(key, request, identity(jwt));
    }

    @DeleteMapping("/{key}")
    @PreAuthorize("hasAuthority('flags:manage')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable String key, @AuthenticationPrincipal Jwt jwt) {
        service.delete(key, identity(jwt));
    }

    @GetMapping("/evaluate")
    Evaluation evaluate(@AuthenticationPrincipal Jwt jwt) {
        List<String> roles = jwt.getClaimAsStringList("roles");
        return new Evaluation(service.evaluate(new Caller(identity(jwt), jwt.getClaimAsString("plan"), roles == null ? List.of() : roles)));
    }

    /** The token's {@code uid}, the subject when a token has none. */
    private static String identity(Jwt jwt) {
        String uid = jwt.getClaimAsString("uid");
        String id = uid != null && !uid.isBlank() ? uid : jwt.getSubject();
        if (id == null || id.isBlank()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "The access token carries no user identity");
        }
        return id;
    }
}
