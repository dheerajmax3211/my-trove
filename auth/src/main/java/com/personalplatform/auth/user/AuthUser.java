package com.personalplatform.auth.user;

import java.util.Set;
import java.util.UUID;

public record AuthUser(UUID id, String firebaseUid, String email, String displayName, Set<String> roles) {}
