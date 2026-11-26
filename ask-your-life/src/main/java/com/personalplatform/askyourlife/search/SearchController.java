package com.personalplatform.askyourlife.search;

import com.personalplatform.askyourlife.document.SourceType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.Set;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/search")
public class SearchController {

    private final SearchService service;

    public SearchController(SearchService service) {
        this.service = service;
    }

    /**
     * @param q          the question or keywords (web-search syntax: quotes, OR, -exclude)
     * @param sourceType repeatable filter
     * @param from       ISO-8601 instant, inclusive lower bound on document creation time
     * @param to         ISO-8601 instant, exclusive upper bound
     * @param debug      include per-list ranks and scores for every hit
     * @param answer     include an extractive, cited answer quoted from the top hits (default true)
     */
    @GetMapping
    public SearchService.Response search(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam @NotBlank @Size(max = 500) String q,
            @RequestParam(defaultValue = "10") @Min(1) @Max(50) int k,
            @RequestParam(defaultValue = "hybrid") String mode,
            @RequestParam(required = false) Set<SourceType> sourceType,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "false") boolean debug,
            @RequestParam(defaultValue = "true") boolean answer) {
        return run(jwt, q, k, mode, sourceType, from, to, debug, answer);
    }

    /** Same search, always with the per-list rank / score breakdown. */
    @GetMapping("/explain")
    public SearchService.Response explain(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam @NotBlank @Size(max = 500) String q,
            @RequestParam(defaultValue = "10") @Min(1) @Max(50) int k,
            @RequestParam(defaultValue = "hybrid") String mode,
            @RequestParam(required = false) Set<SourceType> sourceType,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to) {
        return run(jwt, q, k, mode, sourceType, from, to, true, true);
    }

    private SearchService.Response run(Jwt jwt, String q, int k, String mode, Set<SourceType> types, Instant from,
            Instant to, boolean debug, boolean answer) {
        if (from != null && to != null && !from.isBefore(to)) {
            throw new IllegalArgumentException("'from' must be before 'to'");
        }
        return service.search(jwt.getSubject(),
                new SearchQuery(q.strip(), k, SearchMode.parse(mode), types, from, to), debug, answer);
    }
}
