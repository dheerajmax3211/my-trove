package com.personalplatform.consent.token;

import com.personalplatform.consent.config.SecurityConfig;
import java.util.List;
import java.util.UUID;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

/**
 * Runs after the signature/expiry checks: a signed token is only honoured while the gateway still has it on record as
 * unrevoked and its client enabled. The token's declared use ({@code client} or {@code access}) becomes the authority
 * the filter chain checks, so a client token can never read data and an access token can never create requests.
 */
@Component
public class GatewayTokenConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    private final TokenRepository tokens;
    public GatewayTokenConverter(TokenRepository tokens) {
        this.tokens = tokens;
    }

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        UUID jti;
        try {
            jti = UUID.fromString(jwt.getId());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new InvalidBearerTokenException("Malformed token id");
        }
        var state = tokens.findState(jti)
                .filter(TokenRepository.TokenState::live)
                .orElseThrow(() -> new InvalidBearerTokenException("Token is revoked, unknown or its client is disabled"));
        String declaredUse = jwt.getClaimAsString("token_use");
        if (!state.tokenUse().equals(declaredUse) || !state.clientId().equals(jwt.getSubject())) {
            throw new InvalidBearerTokenException("Token does not match the gateway's record");
        }
        String authority = TokenService.USE_ACCESS.equals(declaredUse) ? SecurityConfig.TOKEN_ACCESS : SecurityConfig.TOKEN_CLIENT;
        return new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority(authority)), jwt.getSubject());
    }
}
