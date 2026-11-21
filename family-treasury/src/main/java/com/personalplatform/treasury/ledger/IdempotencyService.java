package com.personalplatform.treasury.ledger;

import static com.personalplatform.sql.jooq.treasury.treasury.Tables.IDEMPOTENCY_RECORDS;

import com.personalplatform.treasury.web.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.function.Supplier;
import java.util.regex.Pattern;
import org.jooq.DSLContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Exactly-once semantics for write operations, keyed by (scope, Idempotency-Key).
 *
 * <p>The record is inserted INSIDE the operation's own database transaction. Therefore a record exists if and only
 * if the operation committed; a failed operation leaves nothing behind and may be retried with the same key.
 * Two concurrent requests with the same key collide on the primary key: Postgres makes the second
 * {@code INSERT ... ON CONFLICT DO NOTHING} wait until the first transaction ends, then it either replays the
 * stored response (first committed) or proceeds (first rolled back). The same key with a different request
 * fingerprint is rejected with 409.
 */
@Service
public class IdempotencyService {

    private static final Pattern KEY = Pattern.compile("[A-Za-z0-9._:~-]{1,128}");

    /** What an operation produced: HTTP status and a JSON-serialisable body. */
    public record Result<T>(int status, T body) {}

    /** What the caller gets back; {@code replayed} is true when an earlier identical request is being re-served. */
    public record Outcome<T>(int status, T body, boolean replayed) {}

    private final DSLContext dsl;
    private final JsonMapper json;
    private final Clock clock;

    public IdempotencyService(DSLContext dsl, JsonMapper json, Clock clock) {
        this.dsl = dsl;
        this.json = json;
        this.clock = clock;
    }

    public static void validateKey(String key) {
        if (key == null || !KEY.matcher(key).matches()) {
            throw ApiException.badRequest("INVALID_IDEMPOTENCY_KEY",
                    "Idempotency-Key must be 1-128 characters from [A-Za-z0-9._:~-]");
        }
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public <T> Outcome<T> execute(String scope, String key, Object fingerprint, Class<T> bodyType, Supplier<Result<T>> work) {
        validateKey(key);
        String hash = sha256(json.writeValueAsString(fingerprint));
        OffsetDateTime now = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);

        int inserted = dsl.insertInto(IDEMPOTENCY_RECORDS)
                .columns(IDEMPOTENCY_RECORDS.SCOPE, IDEMPOTENCY_RECORDS.IDEM_KEY, IDEMPOTENCY_RECORDS.REQUEST_HASH,
                        IDEMPOTENCY_RECORDS.STATUS, IDEMPOTENCY_RECORDS.RESPONSE, IDEMPOTENCY_RECORDS.CREATED_AT)
                .values(scope, key, hash, 0, "", now)
                .onConflictDoNothing()
                .execute();

        if (inserted == 0) {
            var existing = dsl.select(IDEMPOTENCY_RECORDS.REQUEST_HASH, IDEMPOTENCY_RECORDS.STATUS, IDEMPOTENCY_RECORDS.RESPONSE)
                    .from(IDEMPOTENCY_RECORDS)
                    .where(IDEMPOTENCY_RECORDS.SCOPE.eq(scope).and(IDEMPOTENCY_RECORDS.IDEM_KEY.eq(key)))
                    .fetchOne();
            if (existing == null) {
                // cannot happen: the conflicting row was committed, so it is visible to this new statement
                throw new IllegalStateException("idempotency record vanished");
            }
            if (!existing.value1().equals(hash)) {
                throw ApiException.conflict("IDEMPOTENCY_KEY_REUSED",
                        "this Idempotency-Key was already used with a different request");
            }
            return new Outcome<>(existing.value2(), json.readValue(existing.value3(), bodyType), true);
        }

        Result<T> result = work.get();
        dsl.update(IDEMPOTENCY_RECORDS)
                .set(IDEMPOTENCY_RECORDS.STATUS, result.status())
                .set(IDEMPOTENCY_RECORDS.RESPONSE, json.writeValueAsString(result.body()))
                .where(IDEMPOTENCY_RECORDS.SCOPE.eq(scope).and(IDEMPOTENCY_RECORDS.IDEM_KEY.eq(key)))
                .execute();
        return new Outcome<>(result.status(), result.body(), false);
    }

    static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
