package com.personalplatform.consent.client;

import static com.personalplatform.sql.jooq.consent.consent.Tables.CLIENTS;

import com.personalplatform.sql.UuidV7;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.springframework.stereotype.Repository;

@Repository
public class ClientRepository {

    private final DSLContext dsl;

    public ClientRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    public UUID insert(
            String clientId,
            String owner,
            String name,
            String contactEmail,
            String redirectUri,
            List<String> allowedScopes,
            String secretHash,
            OffsetDateTime now) {
        UUID id = UuidV7.next();
        dsl.insertInto(CLIENTS)
                .set(CLIENTS.ID, id)
                .set(CLIENTS.CLIENT_ID, clientId)
                .set(CLIENTS.OWNER_UID, owner)
                .set(CLIENTS.NAME, name)
                .set(CLIENTS.CONTACT_EMAIL, contactEmail)
                .set(CLIENTS.REDIRECT_URI, redirectUri)
                .set(CLIENTS.ALLOWED_SCOPES, allowedScopes.toArray(String[]::new))
                .set(CLIENTS.SECRET_HASH, secretHash)
                .set(CLIENTS.CREATED_AT, now)
                .execute();
        return id;
    }

    public Optional<ClientRecord> findByClientId(String clientId) {
        return dsl.selectFrom(CLIENTS).where(CLIENTS.CLIENT_ID.eq(clientId)).fetchOptional(ClientRepository::map);
    }

    public Optional<ClientRecord> findForOwner(String owner, String clientId) {
        return dsl.selectFrom(CLIENTS)
                .where(CLIENTS.CLIENT_ID.eq(clientId).and(CLIENTS.OWNER_UID.eq(owner)))
                .fetchOptional(ClientRepository::map);
    }

    public List<ClientRecord> listForOwner(String owner) {
        return dsl.selectFrom(CLIENTS)
                .where(CLIENTS.OWNER_UID.eq(owner))
                .orderBy(CLIENTS.CREATED_AT.desc())
                .fetch(ClientRepository::map);
    }

    public void updateSecret(UUID pk, String secretHash, OffsetDateTime now) {
        dsl.update(CLIENTS)
                .set(CLIENTS.SECRET_HASH, secretHash)
                .set(CLIENTS.SECRET_ROTATED_AT, now)
                .where(CLIENTS.ID.eq(pk))
                .execute();
    }

    public boolean disable(UUID pk, OffsetDateTime now) {
        return dsl.update(CLIENTS)
                .set(CLIENTS.DISABLED_AT, now)
                .where(CLIENTS.ID.eq(pk).and(CLIENTS.DISABLED_AT.isNull()))
                .execute() == 1;
    }

    private static ClientRecord map(Record r) {
        return new ClientRecord(
                r.get(CLIENTS.ID),
                r.get(CLIENTS.CLIENT_ID),
                r.get(CLIENTS.OWNER_UID),
                r.get(CLIENTS.NAME),
                r.get(CLIENTS.CONTACT_EMAIL),
                r.get(CLIENTS.REDIRECT_URI),
                Arrays.asList(r.get(CLIENTS.ALLOWED_SCOPES)),
                r.get(CLIENTS.SECRET_HASH),
                r.get(CLIENTS.CREATED_AT).toInstant(),
                r.get(CLIENTS.SECRET_ROTATED_AT) == null ? null : r.get(CLIENTS.SECRET_ROTATED_AT).toInstant(),
                r.get(CLIENTS.DISABLED_AT) == null ? null : r.get(CLIENTS.DISABLED_AT).toInstant());
    }
}
