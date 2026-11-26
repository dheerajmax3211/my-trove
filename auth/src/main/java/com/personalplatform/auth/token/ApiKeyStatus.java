package com.personalplatform.auth.token;

import java.util.List;
import java.util.UUID;

/**
 * A key's current state as the platform service sees it now (not when its service token was minted): delegation is
 * refused unless it is {@link State#ACTIVE}.
 */
public record ApiKeyStatus(UUID keyId, UUID appId, String ownerUid, State state, List<String> permissions) {

    public enum State { ACTIVE, REVOKED, EXPIRED, APP_DISABLED }

    public ApiKeyStatus {
        permissions = permissions == null ? List.of() : List.copyOf(permissions);
    }
}
