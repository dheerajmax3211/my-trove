package com.personalplatform.gateway.security;

/** A successful exchange: the platform token to forward and what the gateway read from it. */
public record ExchangeResult(String accessToken, TokenClaims claims, CallerIdentity identity) {}
