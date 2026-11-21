package com.personalplatform.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

class PermissionAuthoritiesConverterTest {

    private final PermissionAuthoritiesConverter converter = new PermissionAuthoritiesConverter();

    private static Jwt jwt(Map<String, Object> claims) {
        return Jwt.withTokenValue("t")
                .header("alg", "RS256")
                .subject("u")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .claims(c -> c.putAll(claims))
                .build();
    }

    private List<String> names(Map<String, Object> claims) {
        return converter.convert(jwt(claims)).stream().map(GrantedAuthority::getAuthority).toList();
    }

    @Test
    void mapsRolesToRolePrefixAndPermissionsAsIs() {
        assertThat(names(Map.of(
                        "roles", List.of("DEVELOPER", "MEMBER"),
                        "permissions", List.of("products:use", "apps:manage"))))
                .containsExactlyInAnyOrder("ROLE_DEVELOPER", "ROLE_MEMBER", "products:use", "apps:manage");
    }

    @Test
    void mapsServiceScopes() {
        assertThat(names(Map.of("scopes", List.of("data:read", "data:write"))))
                .containsExactlyInAnyOrder("SCOPE_data:read", "SCOPE_data:write");
    }

    @Test
    void noClaimsMeansNoAuthorities() {
        assertThat(names(Map.of())).isEmpty();
    }

    @Test
    void ignoresMalformedEntries() {
        assertThat(names(Map.of("roles", "ADMIN", "permissions", List.of(" ", 7, "usage:read:all"))))
                .containsExactly("usage:read:all");
    }

    @Test
    void deduplicates() {
        assertThat(names(Map.of("permissions", List.of("a:b", "a:b")))).containsExactly("a:b");
    }
}
