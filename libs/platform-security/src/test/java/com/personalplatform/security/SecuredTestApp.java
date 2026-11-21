package com.personalplatform.security;

import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Minimal service that relies purely on the platform-security auto-configuration. */
@SpringBootConfiguration
@EnableAutoConfiguration
@Import(SecuredTestApp.SecuredController.class)
class SecuredTestApp {

    @RestController
    static class SecuredController {

        @GetMapping("/whoami")
        Map<String, Object> whoami(Authentication authentication) {
            return Map.of(
                    "name", authentication.getName(),
                    "authorities",
                            authentication.getAuthorities().stream()
                                    .map(GrantedAuthority::getAuthority)
                                    // Spring Security 7 adds FACTOR_* authorities describing how the caller authenticated
                                    .filter(a -> !a.startsWith("FACTOR_"))
                                    .sorted()
                                    .collect(Collectors.toList()));
        }

        @GetMapping("/usage")
        @RequiresPermission("usage:read:all")
        String usage() {
            return "usage";
        }

        @GetMapping("/scoped")
        @PreAuthorize("hasAuthority('SCOPE_data:read')")
        String scoped() {
            return "scoped";
        }
    }
}
