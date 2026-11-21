package com.personalplatform.security;

/**
 * Which kind of bearer token a service verifies ({@code app.security.mode}).
 * {@link #FIREBASE} (default) accepts Firebase ID tokens, exactly as before the platform layer existed.
 * {@link #PLATFORM} accepts only RS256 platform tokens issued by {@code auth}.
 */
public enum SecurityMode {
    FIREBASE,
    PLATFORM
}
