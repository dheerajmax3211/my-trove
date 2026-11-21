package com.personalplatform.auth.rbac;

import static com.personalplatform.sql.jooq.auth.auth.Tables.PERMISSIONS;
import static com.personalplatform.sql.jooq.auth.auth.Tables.ROLES;
import static com.personalplatform.sql.jooq.auth.auth.Tables.ROLE_PERMISSIONS;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

@Repository
public class RbacRepository {

    private final DSLContext dsl;

    public RbacRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    /** role name -> permission names. Roles without permissions are present with an empty set. */
    public Map<String, Set<String>> rolePermissions() {
        Map<String, Set<String>> result = new HashMap<>();
        dsl.select(ROLES.NAME).from(ROLES).fetch(ROLES.NAME).forEach(r -> result.put(r, new HashSet<>()));
        dsl.select(ROLE_PERMISSIONS.ROLE_NAME, ROLE_PERMISSIONS.PERMISSION_NAME)
                .from(ROLE_PERMISSIONS)
                .fetch()
                .forEach(r -> result.computeIfAbsent(r.value1(), k -> new HashSet<>()).add(r.value2()));
        return result;
    }

    public Map<String, String> roleDescriptions() {
        Map<String, String> result = new HashMap<>();
        dsl.select(ROLES.NAME, ROLES.DESCRIPTION).from(ROLES).fetch().forEach(r -> result.put(r.value1(), r.value2()));
        return result;
    }

    public Set<String> allPermissions() {
        return new HashSet<>(dsl.select(PERMISSIONS.NAME).from(PERMISSIONS).fetch(PERMISSIONS.NAME));
    }
}
