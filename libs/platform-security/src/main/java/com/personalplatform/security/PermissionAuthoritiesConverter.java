package com.personalplatform.security;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;

/**
 * Turns platform-token claims into Spring authorities: {@code ROLE_<role>} for each {@code roles[]} entry, every
 * {@code permissions[]} string as-is (so {@code hasAuthority('usage:read:all')} works), and {@code SCOPE_<scope>} for
 * each {@code scopes[]} entry of a service principal. Non-string or blank entries are ignored.
 */
public class PermissionAuthoritiesConverter implements Converter<Jwt, Collection<GrantedAuthority>> {

    public static final String ROLES_CLAIM = "roles";
    public static final String PERMISSIONS_CLAIM = "permissions";
    public static final String SCOPES_CLAIM = "scopes";

    @Override
    public Collection<GrantedAuthority> convert(Jwt jwt) {
        Set<String> names = new LinkedHashSet<>();
        strings(jwt, ROLES_CLAIM).forEach(role -> names.add("ROLE_" + role));
        names.addAll(strings(jwt, PERMISSIONS_CLAIM));
        strings(jwt, SCOPES_CLAIM).forEach(scope -> names.add("SCOPE_" + scope));
        List<GrantedAuthority> authorities = new ArrayList<>(names.size());
        names.forEach(name -> authorities.add(new SimpleGrantedAuthority(name)));
        return authorities;
    }

    /** The converter a resource-server chain installs in platform mode. */
    public static JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(new PermissionAuthoritiesConverter());
        return converter;
    }

    private static List<String> strings(Jwt jwt, String claim) {
        Object value = jwt.getClaims().get(claim);
        if (!(value instanceof Collection<?> items)) {
            return List.of();
        }
        List<String> out = new ArrayList<>(items.size());
        for (Object item : items) {
            if (item instanceof String s && !s.isBlank()) {
                out.add(s);
            }
        }
        return out;
    }
}
