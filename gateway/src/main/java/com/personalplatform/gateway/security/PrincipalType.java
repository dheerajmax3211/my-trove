package com.personalplatform.gateway.security;

/** Who is calling, as the usage event reports it (design 5.4). */
public enum PrincipalType {
    USER,
    API_KEY,
    CONSENT_CLIENT,
    ANON
}
