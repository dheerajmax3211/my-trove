package com.personalplatform.auth.user;

import java.util.Set;
import java.util.UUID;

/**
 * A user as the rest of the service sees it: roles and the permissions they imply, plan, suspension flag and the
 * permissions version that goes into platform tokens ({@code pv}).
 */
public record AuthUser(
        UUID id,
        String firebaseUid,
        String email,
        String displayName,
        Set<String> roles,
        Set<String> permissions,
        String plan,
        boolean suspended,
        int permissionsVersion) {}
