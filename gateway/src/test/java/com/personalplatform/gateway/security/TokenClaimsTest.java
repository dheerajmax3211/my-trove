package com.personalplatform.gateway.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.gateway.support.TestJwt;
import java.util.List;
import org.junit.jupiter.api.Test;

class TokenClaimsTest {

    @Test
    void userTokenYieldsAUserIdentityWithPlanAndPermissions() {
        TokenClaims claims = TokenClaims.parse(TestJwt.platformToken("u-1", "PRO", List.of("products:use", "usage:read:self")));

        CallerIdentity identity = claims.toIdentity();
        assertThat(identity.type()).isEqualTo(PrincipalType.USER);
        assertThat(identity.principalId()).isEqualTo("u-1");
        assertThat(identity.plan()).isEqualTo("PRO");
        assertThat(identity.permissions()).containsExactlyInAnyOrder("products:use", "usage:read:self");
        assertThat(identity.appId()).isNull();
        assertThat(claims.expiresAt()).isNotNull();
    }

    @Test
    void serviceTokenYieldsAnApiKeyIdentityNamedByTheApp() {
        CallerIdentity identity = TokenClaims.parse(TestJwt.serviceToken("app-42", "DEVELOPER")).toIdentity();

        assertThat(identity.type()).isEqualTo(PrincipalType.API_KEY);
        assertThat(identity.principalId()).isEqualTo("app:app-42");
        assertThat(identity.appId()).isEqualTo("app-42");
        assertThat(identity.plan()).isEqualTo("DEVELOPER");
    }

    @Test
    void garbageIsRejected() {
        assertThatThrownBy(() -> TokenClaims.parse("not-a-jwt")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> TokenClaims.parse("a.!!!.c")).isInstanceOf(IllegalArgumentException.class);
    }
}
