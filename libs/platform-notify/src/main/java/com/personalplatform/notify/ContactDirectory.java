package com.personalplatform.notify;

import static com.personalplatform.sql.jooq.shared.shared.Tables.USER_CONTACTS;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.jooq.DSLContext;
import org.jooq.impl.DSL;

/**
 * The address on file for each platform user, so that a notification addressed to a uid can be emailed. Filled from the
 * {@code email} claim of platform tokens as users make requests; the relay reads it at send time.
 */
public class ContactDirectory {

    private static final int CACHE_LIMIT = 10_000;

    private final DSLContext dsl;
    private final Map<String, String> lastWritten = new ConcurrentHashMap<>();

    public ContactDirectory(DSLContext dsl) {
        this.dsl = dsl;
    }

    /** Records the address for this uid. Writes only when it changed since this process last saw it. */
    public void remember(String uid, String email) {
        if (uid == null || uid.isBlank() || email == null || email.isBlank()) {
            return;
        }
        String address = email.trim();
        if (address.equals(lastWritten.get(uid))) {
            return;
        }
        dsl.insertInto(USER_CONTACTS)
                .set(USER_CONTACTS.UID, uid)
                .set(USER_CONTACTS.EMAIL, address)
                .set(USER_CONTACTS.UPDATED_AT, Instant.now().atOffset(ZoneOffset.UTC))
                .onConflict(USER_CONTACTS.UID)
                .doUpdate()
                .set(USER_CONTACTS.EMAIL, DSL.excluded(USER_CONTACTS.EMAIL))
                .set(USER_CONTACTS.UPDATED_AT, DSL.excluded(USER_CONTACTS.UPDATED_AT))
                .execute();
        if (lastWritten.size() >= CACHE_LIMIT) {
            lastWritten.clear();
        }
        lastWritten.put(uid, address);
    }

    public Optional<String> emailFor(String uid) {
        return dsl.select(USER_CONTACTS.EMAIL).from(USER_CONTACTS).where(USER_CONTACTS.UID.eq(uid))
                .fetchOptional(USER_CONTACTS.EMAIL);
    }
}
