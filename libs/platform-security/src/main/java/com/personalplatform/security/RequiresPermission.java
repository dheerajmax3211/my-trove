package com.personalplatform.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * Requires the caller to hold a platform permission, e.g. {@code @RequiresPermission("usage:read:all")}.
 * Meta-annotation for {@code @PreAuthorize("hasAuthority('<permission>')")}; 403 when the authority is absent.
 * Method security is switched on by the platform-security auto-configuration. Permissions come from the token's
 * {@code permissions[]} claim (see {@link PermissionAuthoritiesConverter}), so this only works in
 * {@code app.security.mode=platform}.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@PreAuthorize("hasAuthority('{value}')")
public @interface RequiresPermission {

    /** Permission string, {@code resource:action}. */
    String value();
}
