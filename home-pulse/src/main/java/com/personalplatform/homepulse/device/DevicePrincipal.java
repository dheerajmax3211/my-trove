package com.personalplatform.homepulse.device;

import java.util.UUID;

/** Identity of an authenticated ingestion caller: a device, never a person. */
public record DevicePrincipal(UUID deviceId, String ownerUid, UUID applianceId) {}
