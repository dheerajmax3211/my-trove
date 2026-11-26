package com.personalplatform.auth.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.personalplatform.auth.user.AuthUser;
import com.personalplatform.auth.user.UserService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * auth reads roles and permissions from Postgres, not from the token. A delegated API-key token (one with an
 * {@code act} object) must still never get more there than the permissions it carries, and no roles.
 */
class ActingTokenAuthoritiesTest {

    private final UserService users = mock(UserService.class);
    private final Converter<Jwt, AbstractAuthenticationToken> converter = new SecurityConfig().jwtToAuthentication(users);

    private static Jwt token(Map<String, Object> extra) {
        Jwt.Builder b = Jwt.withTokenValue("t").header("alg", "RS256").subject("firebase-owner")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60));
        extra.forEach(b::claim);
        return b.build();
    }

    private static Set<String> authorities(AbstractAuthenticationToken auth) {
        return auth.getAuthorities().stream().map(GrantedAuthority::getAuthority)
                .collect(java.util.stream.Collectors.toSet());
    }

    private void ownerIsAnOwner() {
        when(users.resolve(any())).thenReturn(new AuthUser(UUID.randomUUID(), "firebase-owner", "o@example.test", "O",
                Set.of("OWNER"), Set.of("products:use", "users:write", "roles:assign", "mcp:use"), "FREE", false, 3));
    }

    @Test
    void aDelegatedTokenGetsOnlyTheIntersectionAndNoRoles() {
        ownerIsAnOwner();
        AbstractAuthenticationToken auth = converter.convert(token(Map.of(
                "permissions", List.of("products:use", "keys:manage"),
                "act", Map.of("sub", "app:0190f0a0-0000-7000-8000-0000000000aa"))));
        assertThat(authorities(auth)).containsExactly("products:use");
    }

    @Test
    void aSignInTokenStillGetsTheDatabaseRolesAndPermissions() {
        ownerIsAnOwner();
        AbstractAuthenticationToken auth = converter.convert(token(Map.of("permissions", List.of("products:use"))));
        assertThat(authorities(auth)).contains("ROLE_OWNER", "users:write", "roles:assign", "products:use");
    }
}
