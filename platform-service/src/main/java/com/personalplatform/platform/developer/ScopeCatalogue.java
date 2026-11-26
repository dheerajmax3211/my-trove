package com.personalplatform.platform.developer;

import java.util.List;
import java.util.Optional;
import java.util.TreeSet;

/**
 * The scopes an API key can carry and the permissions each one grants. A key's service token carries the permissions
 * (so every service's existing permission checks apply unchanged) and the gateway refuses any route whose permission
 * the key does not hold. Only scopes with a real endpoint behind them belong here.
 */
final class ScopeCatalogue {

    record Scope(String name, String description, List<String> permissions) {}

    static final List<Scope> ALL = List.of(
            new Scope("usage:read", "Read your own usage and request counts (GET /v1/usage/me)", List.of("usage:read:self")),
            // Opens POST /api/mcp/mcp to the key (initialize, tools/list).
            new Scope("mcp:use", "Connect an AI agent to the MCP server (POST /api/mcp/mcp)", List.of("mcp:use")),
            // With mcp:use, lets the MCP tools read the key owner's product data: mcp-server asks auth for a 5-minute
            // token for the owner holding (owner's permissions) AND (key's permissions). The gateway opens no product
            // route to API keys (gateway.api-key-routes), so this permission is usable only through the MCP server.
            new Scope("products:read", "Let an AI agent read your product data through the MCP server's read-only "
                    + "tools (needs mcp:use too)", List.of("products:use")));

    private ScopeCatalogue() {}

    static Optional<Scope> find(String name) {
        return ALL.stream().filter(s -> s.name().equals(name)).findFirst();
    }

    /** Distinct, sorted permissions granted by the given scopes (unknown names grant nothing). */
    static List<String> permissionsFor(List<String> scopes) {
        TreeSet<String> out = new TreeSet<>();
        for (String scope : scopes) {
            find(scope).ifPresent(s -> out.addAll(s.permissions()));
        }
        return List.copyOf(out);
    }
}
