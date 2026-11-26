package com.personalplatform.mcp.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Where auth's delegated-token endpoint lives and the shared internal key it needs ({@code app.mcp.delegation.*}).
 * Used only when the caller is an API key: mcp-server trades the key's service token for a short-lived token for the
 * key's owner. A blank internal key means API keys cannot read product data (the tools answer
 * {@code delegation_unavailable}); people are unaffected.
 *
 * @param authUrl        base URI of the auth service (not the gateway: the gateway blocks {@code /internal/**})
 * @param internalApiKey the shared {@code APP_INTERNAL_API_KEY}; never printed
 */
@ConfigurationProperties("app.mcp.delegation")
public record DelegationProperties(String authUrl, String internalApiKey) {

    public DelegationProperties {
        authUrl = authUrl == null || authUrl.isBlank() ? "http://localhost:8081"
                : authUrl.endsWith("/") ? authUrl.substring(0, authUrl.length() - 1) : authUrl;
        internalApiKey = internalApiKey == null ? "" : internalApiKey;
    }

    @Override
    public String toString() {
        return "DelegationProperties[authUrl=" + authUrl + ", internalApiKey=<redacted>]";
    }
}
