package com.personalplatform.auth.config;

import com.nimbusds.jwt.JWTParser;
import java.text.ParseException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

/**
 * The auth service is the one service that must accept both kinds of token: a Firebase ID token (to exchange it,
 * and for direct calls) and a platform token (everything the gateway forwards after the exchange). The unverified
 * {@code iss} claim only picks which decoder runs; that decoder then verifies signature, issuer, audience and
 * expiry in full, so a forged {@code iss} gains nothing.
 */
final class DualTokenDecoder implements JwtDecoder {

    private final JwtDecoder firebase;
    private final JwtDecoder platform;
    private final String platformIssuer;

    DualTokenDecoder(JwtDecoder firebase, JwtDecoder platform, String platformIssuer) {
        this.firebase = firebase;
        this.platform = platform;
        this.platformIssuer = platformIssuer;
    }

    @Override
    public Jwt decode(String token) throws JwtException {
        return platformIssuer.equals(unverifiedIssuer(token)) ? platform.decode(token) : firebase.decode(token);
    }

    private static String unverifiedIssuer(String token) {
        try {
            return JWTParser.parse(token).getJWTClaimsSet().getIssuer();
        } catch (ParseException e) {
            return null;
        }
    }
}
