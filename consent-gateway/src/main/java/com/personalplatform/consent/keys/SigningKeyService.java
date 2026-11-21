package com.personalplatform.consent.keys;

import static com.personalplatform.sql.jooq.consent.consent.Tables.SIGNING_KEYS;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.SecurityContext;
import com.personalplatform.consent.config.ConsentProperties;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.text.ParseException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.jooq.DSLContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Owns the RS256 signing keys. Keys are generated on first use, stored with the private half encrypted at rest, and
 * rotated: a retired key stays in the JWKS (verification only) until every token it signed has expired.
 * Key material is never logged; only key ids are.
 */
@Service
public class SigningKeyService implements ApplicationRunner {

    private static final Logger LOG = LoggerFactory.getLogger(SigningKeyService.class);
    private static final long KEY_LOCK = 7_315_001L;
    private static final Duration CACHE_TTL = Duration.ofSeconds(30);
    private static final Duration FORCED_REFRESH_MIN_INTERVAL = Duration.ofSeconds(5);

    /** The key currently used to sign. */
    public record ActiveKey(String kid, RSAPrivateKey privateKey) {
        public RSASSASigner signer() {
            return new RSASSASigner(privateKey);
        }

        @Override
        public String toString() {
            return "ActiveKey[kid=" + kid + "]";
        }
    }

    private record Cached<T>(T value, Instant loadedAt) {}

    private final DSLContext dsl;
    private final TransactionTemplate tx;
    private final KeyCipher cipher;
    private final ConsentProperties props;
    private final Clock clock;

    private volatile Cached<ActiveKey> active;
    private volatile Cached<JWKSet> verification;
    private volatile Instant lastForcedRefresh = Instant.EPOCH;

    public SigningKeyService(
            DSLContext dsl, TransactionTemplate tx, KeyCipher cipher, ConsentProperties props, Clock clock) {
        this.dsl = dsl;
        this.tx = tx;
        this.cipher = cipher;
        this.props = props;
        this.clock = clock;
    }

    /** Create the first key at startup so the first request does not pay for RSA generation. */
    @Override
    public void run(ApplicationArguments args) {
        activeKey();
    }

    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT1H")
    void scheduledRotation() {
        if (props.autoRotateKeys()) {
            rotateIfDue();
        }
    }

    public ActiveKey activeKey() {
        Cached<ActiveKey> c = active;
        if (c != null && clock.instant().isBefore(c.loadedAt().plus(CACHE_TTL))) {
            return c.value();
        }
        ActiveKey loaded = tx.execute(status -> loadOrCreateActive());
        active = new Cached<>(loaded, clock.instant());
        return loaded;
    }

    /** Public keys (no private material) of every key that may still have unexpired tokens. */
    public JWKSet verificationJwkSet() {
        Cached<JWKSet> c = verification;
        if (c != null && clock.instant().isBefore(c.loadedAt().plus(CACHE_TTL))) {
            return c.value();
        }
        return reloadVerification();
    }

    /** JWKS-shaped source for the JWT decoder; re-reads the DB once when it meets an unknown kid. */
    public JWKSource<SecurityContext> jwkSource() {
        return (selector, ctx) -> {
            List<JWK> hits = selector.select(verificationJwkSet());
            if (hits.isEmpty() && clock.instant().isAfter(lastForcedRefresh.plus(FORCED_REFRESH_MIN_INTERVAL))) {
                lastForcedRefresh = clock.instant();
                hits = selector.select(reloadVerification());
            }
            return hits;
        };
    }

    /** Retire the active key (it stays verifiable until its tokens expire) and start signing with a fresh one. */
    public String rotate() {
        String kid = tx.execute(status -> {
            lock();
            OffsetDateTime now = now();
            Duration grace = props.accessTokenTtl().compareTo(props.clientTokenTtl()) >= 0
                    ? props.accessTokenTtl()
                    : props.clientTokenTtl();
            dsl.update(SIGNING_KEYS)
                    .set(SIGNING_KEYS.STATUS, "RETIRED")
                    .set(SIGNING_KEYS.RETIRED_AT, now)
                    .set(SIGNING_KEYS.VERIFY_UNTIL, now.plus(grace).plus(props.clockSkew()))
                    .where(SIGNING_KEYS.STATUS.eq("ACTIVE"))
                    .execute();
            return insertNewKey(now).kid();
        });
        invalidate();
        LOG.info("Signing key rotated; new kid={}", kid);
        return kid;
    }

    public boolean rotateIfDue() {
        OffsetDateTime createdAt = dsl.select(SIGNING_KEYS.CREATED_AT)
                .from(SIGNING_KEYS)
                .where(SIGNING_KEYS.STATUS.eq("ACTIVE"))
                .fetchOne(SIGNING_KEYS.CREATED_AT);
        if (createdAt != null && !clock.instant().isBefore(createdAt.toInstant().plus(props.keyRotationInterval()))) {
            rotate();
            return true;
        }
        return false;
    }

    private void invalidate() {
        active = null;
        verification = null;
    }

    private JWKSet reloadVerification() {
        OffsetDateTime now = now();
        List<JWK> keys = new ArrayList<>();
        for (String json : dsl.select(SIGNING_KEYS.PUBLIC_JWK)
                .from(SIGNING_KEYS)
                .where(SIGNING_KEYS.STATUS.eq("ACTIVE").or(SIGNING_KEYS.VERIFY_UNTIL.gt(now)))
                .orderBy(SIGNING_KEYS.CREATED_AT.desc())
                .fetch(SIGNING_KEYS.PUBLIC_JWK)) {
            try {
                keys.add(RSAKey.parse(json).toPublicJWK());
            } catch (ParseException e) {
                throw new IllegalStateException("Stored public JWK is unreadable", e);
            }
        }
        if (keys.isEmpty()) {
            activeKey();
            return reloadVerification();
        }
        JWKSet set = new JWKSet(keys);
        verification = new Cached<>(set, clock.instant());
        return set;
    }

    private ActiveKey loadOrCreateActive() {
        lock();
        var row = dsl.selectFrom(SIGNING_KEYS).where(SIGNING_KEYS.STATUS.eq("ACTIVE")).fetchOne();
        if (row == null) {
            LOG.info("No signing key found; generating the first one");
            return insertNewKey(now());
        }
        return decode(row.getKid(), row.getPrivateKeyEnc());
    }

    private ActiveKey insertNewKey(OffsetDateTime now) {
        try {
            KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
            gen.initialize(props.rsaKeySize());
            KeyPair pair = gen.generateKeyPair();
            RSAKey publicJwk = new RSAKey.Builder((RSAPublicKey) pair.getPublic())
                    .keyUse(KeyUse.SIGNATURE)
                    .algorithm(JWSAlgorithm.RS256)
                    .keyIDFromThumbprint()
                    .build();
            String kid = publicJwk.getKeyID();
            byte[] pkcs8 = pair.getPrivate().getEncoded();
            dsl.insertInto(SIGNING_KEYS)
                    .set(SIGNING_KEYS.KID, kid)
                    .set(SIGNING_KEYS.ALGORITHM, "RS256")
                    .set(SIGNING_KEYS.STATUS, "ACTIVE")
                    .set(SIGNING_KEYS.PUBLIC_JWK, publicJwk.toJSONString())
                    .set(SIGNING_KEYS.PRIVATE_KEY_ENC, cipher.encrypt(kid, pkcs8))
                    .set(SIGNING_KEYS.ENC_ALG, KeyCipher.ALGORITHM)
                    .set(SIGNING_KEYS.CREATED_AT, now)
                    .execute();
            return new ActiveKey(kid, (RSAPrivateKey) pair.getPrivate());
        } catch (java.security.GeneralSecurityException | com.nimbusds.jose.JOSEException e) {
            throw new IllegalStateException("Could not generate a signing key", e);
        }
    }

    private ActiveKey decode(String kid, byte[] encrypted) {
        byte[] pkcs8 = cipher.decrypt(kid, encrypted);
        try {
            return new ActiveKey(
                    kid, (RSAPrivateKey) KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(pkcs8)));
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException("Stored signing key " + kid + " is unreadable", e);
        } finally {
            java.util.Arrays.fill(pkcs8, (byte) 0);
        }
    }

    private void lock() {
        dsl.fetch("select cast(pg_advisory_xact_lock(?) as text)", KEY_LOCK);
    }

    private OffsetDateTime now() {
        return clock.instant().atOffset(ZoneOffset.UTC);
    }
}
