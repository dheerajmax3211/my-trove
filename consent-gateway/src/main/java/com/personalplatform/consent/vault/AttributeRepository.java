package com.personalplatform.consent.vault;

import static com.personalplatform.sql.jooq.consent.consent.Tables.ATTRIBUTES;

import com.personalplatform.consent.policy.Sensitivity;
import com.personalplatform.sql.UuidV7;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.jooq.Condition;
import org.jooq.DSLContext;
import org.jooq.JSON;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

/** Every query here is scoped by owner_uid: there is no way to read another owner's attribute through this class. */
@Repository
public class AttributeRepository {

    private final DSLContext dsl;
    private final JsonMapper json;

    public AttributeRepository(DSLContext dsl, JsonMapper json) {
        this.dsl = dsl;
        this.json = json;
    }

    /** @return false if the key already exists for this owner */
    public boolean insert(String owner, String keyPath, tools.jackson.databind.JsonNode value, Sensitivity s, OffsetDateTime now) {
        return dsl.insertInto(ATTRIBUTES)
                .set(ATTRIBUTES.ID, UuidV7.next())
                .set(ATTRIBUTES.OWNER_UID, owner)
                .set(ATTRIBUTES.KEY_PATH, keyPath)
                .set(ATTRIBUTES.VALUE, JSON.valueOf(json.writeValueAsString(value)))
                .set(ATTRIBUTES.SENSITIVITY, s.name())
                .set(ATTRIBUTES.CREATED_AT, now)
                .set(ATTRIBUTES.UPDATED_AT, now)
                .onConflict(ATTRIBUTES.OWNER_UID, ATTRIBUTES.KEY_PATH)
                .doNothing()
                .execute() == 1;
    }

    /** @return false if no such attribute */
    public boolean update(String owner, String keyPath, tools.jackson.databind.JsonNode value, Sensitivity s, OffsetDateTime now) {
        return dsl.update(ATTRIBUTES)
                .set(ATTRIBUTES.VALUE, JSON.valueOf(json.writeValueAsString(value)))
                .set(ATTRIBUTES.SENSITIVITY, s.name())
                .set(ATTRIBUTES.UPDATED_AT, now)
                .where(ATTRIBUTES.OWNER_UID.eq(owner).and(ATTRIBUTES.KEY_PATH.eq(keyPath)))
                .execute() == 1;
    }

    public boolean delete(String owner, String keyPath) {
        return dsl.deleteFrom(ATTRIBUTES)
                .where(ATTRIBUTES.OWNER_UID.eq(owner).and(ATTRIBUTES.KEY_PATH.eq(keyPath)))
                .execute() == 1;
    }

    public Optional<AttributeRecord> find(String owner, String keyPath) {
        return dsl.selectFrom(ATTRIBUTES)
                .where(ATTRIBUTES.OWNER_UID.eq(owner).and(ATTRIBUTES.KEY_PATH.eq(keyPath)))
                .fetchOptional(this::map);
    }

    /** Attributes equal to or below {@code prefix} (whole path segments); null prefix lists everything. */
    public List<AttributeRecord> list(String owner, String prefix) {
        Condition c = ATTRIBUTES.OWNER_UID.eq(owner);
        if (prefix != null) {
            // starts_with(), not LIKE: '_' is a LIKE wildcard and is legal in key paths.
            c = c.and(ATTRIBUTES.KEY_PATH.eq(prefix)
                    .or(DSL.condition("starts_with({0}, {1})", ATTRIBUTES.KEY_PATH, DSL.val(prefix + "."))));
        }
        return dsl.selectFrom(ATTRIBUTES).where(c).orderBy(ATTRIBUTES.KEY_PATH).fetch(this::map);
    }

    private AttributeRecord map(org.jooq.Record r) {
        return new AttributeRecord(
                r.get(ATTRIBUTES.KEY_PATH),
                json.readTree(r.get(ATTRIBUTES.VALUE).data()),
                Sensitivity.valueOf(r.get(ATTRIBUTES.SENSITIVITY)),
                r.get(ATTRIBUTES.CREATED_AT).toInstant(),
                r.get(ATTRIBUTES.UPDATED_AT).toInstant());
    }
}
