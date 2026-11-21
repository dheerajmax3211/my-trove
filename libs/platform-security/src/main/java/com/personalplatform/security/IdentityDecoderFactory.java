package com.personalplatform.security;

import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;
import org.springframework.security.oauth2.jwt.JwtDecoder;

/**
 * Mode-aware identity decoder. {@code app.security.mode=firebase} (default) returns the Firebase ID-token decoder,
 * {@code platform} returns the platform-token decoder. Services that declare their own security chain call this
 * instead of {@link FirebaseJwtDecoderFactory} so they follow the platform mode too.
 */
public final class IdentityDecoderFactory {

    private IdentityDecoderFactory() {}

    /** Reads {@code app.security.mode}, {@code app.firebase.*} and {@code app.platform.*} from the environment. */
    public static JwtDecoder create(Environment environment) {
        Binder binder = Binder.get(environment);
        SecurityMode mode = binder.bind("app.security.mode", SecurityMode.class).orElse(SecurityMode.FIREBASE);
        FirebaseProperties firebase = binder.bind("app.firebase", FirebaseProperties.class)
                .orElseGet(() -> new FirebaseProperties(null, null));
        PlatformProperties platform = binder.bind("app.platform", PlatformProperties.class)
                .orElseGet(() -> new PlatformProperties(null, null));
        return create(mode, firebase, platform);
    }

    public static JwtDecoder create(SecurityMode mode, FirebaseProperties firebase, PlatformProperties platform) {
        return mode == SecurityMode.PLATFORM
                ? PlatformJwtDecoderFactory.create(platform)
                : FirebaseJwtDecoderFactory.create(firebase);
    }
}
