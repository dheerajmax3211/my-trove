package com.personalplatform.auth.rbac;

import java.util.Optional;

/** Human personas (design 5.2). Stored as role names in {@code auth.roles}. */
public enum Persona {
    OWNER,
    ADMIN,
    DEVELOPER,
    MEMBER,
    AUDITOR;

    /** ADMIN and OWNER can only be granted, revoked or touched by someone holding {@code roles:assign:privileged}. */
    public boolean privileged() {
        return this == OWNER || this == ADMIN;
    }

    public static Optional<Persona> parse(String role) {
        for (Persona p : values()) {
            if (p.name().equals(role)) {
                return Optional.of(p);
            }
        }
        return Optional.empty();
    }

    public static boolean isPrivileged(String role) {
        return parse(role).map(Persona::privileged).orElse(false);
    }
}
