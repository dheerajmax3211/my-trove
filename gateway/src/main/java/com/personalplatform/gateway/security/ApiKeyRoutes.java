package com.personalplatform.gateway.security;

import com.personalplatform.gateway.config.GatewayProperties;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.http.server.PathContainer;
import org.springframework.stereotype.Component;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

/** Which routes an API key may call, and the permission each one needs (from {@code gateway.api-key-routes}). */
@Component
public class ApiKeyRoutes {

    record Rule(String service, List<String> methods, PathPattern pattern, String permission) {}

    private final List<Rule> rules;

    public ApiKeyRoutes(GatewayProperties props) {
        this.rules = props.apiKeyRoutes().stream()
                .map(r -> new Rule(r.service(),
                        r.methods().stream().map(m -> m.toUpperCase(Locale.ROOT)).toList(),
                        PathPatternParser.defaultInstance.parse(r.path()),
                        r.permission()))
                .toList();
    }

    /** The permission the route needs, or empty when no rule lists it (the call must then be refused). */
    public Optional<String> requiredPermission(String service, String method, String downstreamPath) {
        PathContainer path = PathContainer.parsePath(downstreamPath);
        return rules.stream()
                .filter(r -> r.service().equals(service))
                .filter(r -> r.methods().isEmpty() || r.methods().contains(method.toUpperCase(Locale.ROOT)))
                .filter(r -> r.pattern().matches(path))
                .map(Rule::permission)
                .findFirst();
    }
}
