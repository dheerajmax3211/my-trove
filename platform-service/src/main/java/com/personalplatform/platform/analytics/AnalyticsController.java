package com.personalplatform.platform.analytics;

import com.personalplatform.platform.analytics.Dtos.TopUser;
import com.personalplatform.platform.analytics.Dtos.UsageSummary;
import com.personalplatform.platform.web.BadRequestException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Usage analytics over the metered gateway traffic. Permissions come from the platform token (design 5.2):
 * {@code usage:read:all} for the platform-wide views (OWNER, ADMIN, AUDITOR), {@code usage:read:self} for a caller's own
 * numbers. Times are ISO-8601 instants ({@code 2031-03-01T00:00:00Z}); the range defaults to the last 24 hours and may
 * not exceed 366 days.
 */
@RestController
@RequestMapping("/v1/usage")
class AnalyticsController {

    static final Duration DEFAULT_RANGE = Duration.ofHours(24);
    static final Duration MAX_RANGE = Duration.ofDays(366);
    static final int MAX_TOP_USERS = 100;

    private final AnalyticsRepository repository;
    private final Clock clock;

    AnalyticsController(AnalyticsRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @GetMapping("/summary")
    @PreAuthorize("hasAuthority('usage:read:all')")
    UsageSummary summary(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
                         @RequestParam(required = false) String service,
                         @RequestParam(required = false) String principalId) {
        Range range = range(from, to);
        return repository.summary(range.resolution(), range.from(), range.to(), blankToNull(service), blankToNull(principalId));
    }

    @GetMapping("/top-users")
    @PreAuthorize("hasAuthority('usage:read:all')")
    List<TopUser> topUsers(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
                           @RequestParam(defaultValue = "10") int limit) {
        if (limit < 1 || limit > MAX_TOP_USERS) {
            throw new BadRequestException("limit must be between 1 and " + MAX_TOP_USERS);
        }
        Range range = range(from, to);
        return repository.topUsers(range.resolution(), range.from(), range.to(), limit);
    }

    /**
     * The caller's own usage. Scoped to the token's {@code uid} claim (the subject when a token has none) and takes no
     * principal parameter at all, so a {@code principalId} in the query string is ignored. Also open to
     * {@code usage:read:all} holders because the AUDITOR persona has the latter but not {@code usage:read:self}.
     */
    @GetMapping("/me")
    @PreAuthorize("hasAnyAuthority('usage:read:self', 'usage:read:all')")
    UsageSummary me(@AuthenticationPrincipal Jwt jwt,
                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        Range range = range(from, to);
        return repository.summary(range.resolution(), range.from(), range.to(), null, callerId(jwt));
    }

    private static String callerId(Jwt jwt) {
        String uid = jwt.getClaimAsString("uid");
        String id = uid != null && !uid.isBlank() ? uid : jwt.getSubject();
        if (id == null || id.isBlank()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "The access token carries no user identity");
        }
        return id;
    }

    private record Range(Instant from, Instant to, Resolution resolution) {
    }

    private Range range(Instant from, Instant to) {
        Instant now = clock.instant();
        Instant end = to != null ? to : now;
        Instant start = from != null ? from : end.minus(DEFAULT_RANGE);
        if (!start.isBefore(end)) {
            throw new BadRequestException("'from' must be before 'to'");
        }
        if (Duration.between(start, end).compareTo(MAX_RANGE) > 0) {
            throw new BadRequestException("The range must not exceed " + MAX_RANGE.toDays() + " days");
        }
        return new Range(start, end, Resolution.forRange(start, end, now));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
