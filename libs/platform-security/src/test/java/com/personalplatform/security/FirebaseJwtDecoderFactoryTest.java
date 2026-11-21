package com.personalplatform.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class FirebaseJwtDecoderFactoryTest {

    @Test
    void refusesToStartWithoutProjectId() {
        assertThatThrownBy(() -> FirebaseJwtDecoderFactory.create(new FirebaseProperties("", null)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FIREBASE_PROJECT_ID");
    }

    @Test
    void defaultsToGoogleJwks() {
        assertThat(new FirebaseProperties("p", null).jwkSetUri()).isEqualTo(FirebaseProperties.DEFAULT_JWK_SET_URI);
    }

    @Test
    void rejectsGarbageTokens() {
        var decoder = FirebaseJwtDecoderFactory.create(new FirebaseProperties("my-project", null));
        assertThatThrownBy(() -> decoder.decode("not-a-jwt")).isInstanceOf(RuntimeException.class);
    }
}
