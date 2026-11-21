package com.personalplatform.homepulse.config;

import com.personalplatform.homepulse.device.DevicePrincipal;
import java.util.List;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/** Authenticated device: the principal is a {@link DevicePrincipal}, authority is {@code ROLE_DEVICE}. */
final class DeviceAuthentication extends AbstractAuthenticationToken {

    private final DevicePrincipal principal;

    DeviceAuthentication(DevicePrincipal principal) {
        super(List.of(new SimpleGrantedAuthority("ROLE_DEVICE")));
        this.principal = principal;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return "";   // the token is never retained after verification
    }

    @Override
    public Object getPrincipal() {
        return principal;
    }
}
