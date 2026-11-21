package com.personalplatform.gateway.security;

import com.personalplatform.gateway.config.GatewayProperties;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.server.PathContainer;
import org.springframework.stereotype.Component;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

/**
 * Decides which requests skip the exchange because the downstream service authenticates them itself (device tokens,
 * webhook secrets, tokens it issued, signed links). Rules come from {@code gateway.passthrough}; nothing is
 * passthrough unless a rule says so. Matching is on the downstream path, i.e. after {@code /api/<service>}.
 */
@Component
public class PassthroughMatcher {

    public record Match(String pattern, PrincipalType principalType) {}

    private record Rule(String service, Set<String> methods, PathPattern pattern, String raw, PrincipalType type) {}

    private final List<Rule> rules;

    public PassthroughMatcher(GatewayProperties props) {
        PathPatternParser parser = PathPatternParser.defaultInstance;
        this.rules = props.passthrough().stream()
                .map(p -> new Rule(
                        p.service(),
                        p.methods().stream().map(m -> m.toUpperCase(Locale.ROOT)).collect(java.util.stream.Collectors.toSet()),
                        parser.parse(p.path()),
                        p.path(),
                        PrincipalType.valueOf(p.principalType().toUpperCase(Locale.ROOT))))
                .toList();
    }

    public Optional<Match> match(String service, String method, String downstreamPath) {
        PathContainer path = PathContainer.parsePath(downstreamPath);
        for (Rule rule : rules) {
            if (rule.service().equals(service)
                    && (rule.methods().isEmpty() || rule.methods().contains(method.toUpperCase(Locale.ROOT)))
                    && rule.pattern().matches(path)) {
                return Optional.of(new Match(rule.raw(), rule.type()));
            }
        }
        return Optional.empty();
    }
}
