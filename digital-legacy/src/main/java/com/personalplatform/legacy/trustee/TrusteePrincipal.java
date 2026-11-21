package com.personalplatform.legacy.trustee;

import java.util.UUID;

/** Who a trustee token authenticates as. Carries only ids; never the token itself. */
public record TrusteePrincipal(UUID trusteeId, UUID vaultId) {}
