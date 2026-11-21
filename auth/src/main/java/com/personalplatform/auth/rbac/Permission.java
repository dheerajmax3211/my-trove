package com.personalplatform.auth.rbac;

import java.util.Arrays;
import java.util.Optional;

/**
 * The permission catalogue (design 5.2). The database ({@code auth.permissions}) is the source of truth for which role
 * holds what; this enum exists so code never spells a permission string by hand. A test keeps both in step.
 */
public enum Permission {
    PRODUCTS_USE("products:use"),
    USAGE_READ_SELF("usage:read:self"),
    USAGE_READ_ALL("usage:read:all"),
    CONNECTIONS_MANAGE("connections:manage"),
    APPS_MANAGE("apps:manage"),
    APPS_READ_ALL("apps:read:all"),
    KEYS_MANAGE("keys:manage"),
    WEBHOOKS_MANAGE("webhooks:manage"),
    SANDBOX_USE("sandbox:use"),
    LOGS_READ_OWN("logs:read:own"),
    WORKSPACES_MANAGE("workspaces:manage"),
    USERS_READ("users:read"),
    USERS_WRITE("users:write"),
    ROLES_ASSIGN("roles:assign"),
    ROLES_ASSIGN_PRIVILEGED("roles:assign:privileged"),
    PLANS_MANAGE("plans:manage"),
    FLAGS_MANAGE("flags:manage"),
    AUDIT_READ("audit:read"),
    SUPPORT_IMPERSONATE("support:impersonate");

    private final String value;

    Permission(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static Optional<Permission> parse(String value) {
        return Arrays.stream(values()).filter(p -> p.value.equals(value)).findFirst();
    }
}
