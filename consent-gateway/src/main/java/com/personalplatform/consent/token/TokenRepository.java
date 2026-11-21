package com.personalplatform.consent.token;

import static com.personalplatform.sql.jooq.consent.consent.Tables.CLIENTS;
import static com.personalplatform.sql.jooq.consent.consent.Tables.ISSUED_TOKENS;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

@Repository
public class TokenRepository {

    /** What the gateway knows about a token it signed. */
    public record TokenState(
            UUID jti,
            UUID clientPk,
            String clientId,
            UUID grantId,
            String tokenUse,
            Instant expiresAt,
            Instant revokedAt,
            boolean clientDisabled) {

        /** Not revoked and its client is enabled. Expiry is checked separately (the JWT validator applies clock skew). */
        public boolean live() {
            return revokedAt == null && !clientDisabled;
        }

        /** Strict check used by introspection: live and not past its expiry. */
        public boolean usable(Instant now) {
            return live() && now.isBefore(expiresAt);
        }
    }

    private final DSLContext dsl;

    public TokenRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    public void insert(
            UUID jti, UUID clientPk, UUID grantId, String tokenUse, String kid, OffsetDateTime issuedAt, OffsetDateTime expiresAt) {
        dsl.insertInto(ISSUED_TOKENS)
                .set(ISSUED_TOKENS.JTI, jti)
                .set(ISSUED_TOKENS.CLIENT_PK, clientPk)
                .set(ISSUED_TOKENS.GRANT_ID, grantId)
                .set(ISSUED_TOKENS.TOKEN_USE, tokenUse)
                .set(ISSUED_TOKENS.KID, kid)
                .set(ISSUED_TOKENS.ISSUED_AT, issuedAt)
                .set(ISSUED_TOKENS.EXPIRES_AT, expiresAt)
                .execute();
    }

    public Optional<TokenState> findState(UUID jti) {
        return dsl.select(ISSUED_TOKENS.fields())
                .select(CLIENTS.CLIENT_ID, CLIENTS.DISABLED_AT)
                .from(ISSUED_TOKENS)
                .join(CLIENTS)
                .on(CLIENTS.ID.eq(ISSUED_TOKENS.CLIENT_PK))
                .where(ISSUED_TOKENS.JTI.eq(jti))
                .fetchOptional(r -> new TokenState(
                        r.get(ISSUED_TOKENS.JTI),
                        r.get(ISSUED_TOKENS.CLIENT_PK),
                        r.get(CLIENTS.CLIENT_ID),
                        r.get(ISSUED_TOKENS.GRANT_ID),
                        r.get(ISSUED_TOKENS.TOKEN_USE),
                        r.get(ISSUED_TOKENS.EXPIRES_AT).toInstant(),
                        r.get(ISSUED_TOKENS.REVOKED_AT) == null ? null : r.get(ISSUED_TOKENS.REVOKED_AT).toInstant(),
                        r.get(CLIENTS.DISABLED_AT) != null));
    }

    /** Revokes a token, but only if it belongs to {@code clientPk}. */
    public boolean revoke(UUID jti, UUID clientPk, OffsetDateTime now) {
        return dsl.update(ISSUED_TOKENS)
                .set(ISSUED_TOKENS.REVOKED_AT, now)
                .where(ISSUED_TOKENS.JTI.eq(jti)
                        .and(ISSUED_TOKENS.CLIENT_PK.eq(clientPk))
                        .and(ISSUED_TOKENS.REVOKED_AT.isNull()))
                .execute() == 1;
    }

    public int revokeAllForClient(UUID clientPk, OffsetDateTime now) {
        return dsl.update(ISSUED_TOKENS)
                .set(ISSUED_TOKENS.REVOKED_AT, now)
                .where(ISSUED_TOKENS.CLIENT_PK.eq(clientPk).and(ISSUED_TOKENS.REVOKED_AT.isNull()))
                .execute();
    }
}
