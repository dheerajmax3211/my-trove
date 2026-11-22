package com.personalplatform.homepulse.eval;

import static com.personalplatform.sql.jooq.home_pulse.home_pulse.Tables.BASELINES;

import com.personalplatform.homepulse.detect.Baseline;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.JSON;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class BaselineRepository {

    public enum Status { LEARNING, READY }

    /** {@code stats} is null while LEARNING. */
    public record Row(UUID applianceId, Status status, Instant learnFrom, Instant learnedAt, Baseline stats) {}

    private final DSLContext dsl;
    private final JsonMapper json;

    public BaselineRepository(DSLContext dsl, JsonMapper json) {
        this.dsl = dsl;
        this.json = json;
    }

    public Optional<Row> find(UUID applianceId) {
        return dsl.selectFrom(BASELINES).where(BASELINES.APPLIANCE_ID.eq(applianceId)).fetchOptional(r -> new Row(
                r.getApplianceId(), Status.valueOf(r.getStatus()), r.getLearnFrom().toInstant(),
                r.getLearnedAt() == null ? null : r.getLearnedAt().toInstant(),
                r.getStats() == null ? null : json.readValue(r.getStats().data(), Baseline.class)));
    }

    /** (Re)starts learning at {@code learnFrom}; any previous baseline is discarded. */
    public void startLearning(UUID applianceId, Instant learnFrom, Instant now) {
        OffsetDateTime from = learnFrom.atOffset(ZoneOffset.UTC);
        OffsetDateTime t = now.atOffset(ZoneOffset.UTC);
        dsl.insertInto(BASELINES)
                .set(BASELINES.APPLIANCE_ID, applianceId)
                .set(BASELINES.STATUS, Status.LEARNING.name())
                .set(BASELINES.LEARN_FROM, from)
                .set(BASELINES.UPDATED_AT, t)
                .onConflict(BASELINES.APPLIANCE_ID).doUpdate()
                .set(BASELINES.STATUS, Status.LEARNING.name())
                .set(BASELINES.LEARN_FROM, from)
                .setNull(BASELINES.LEARNED_AT)
                .setNull(BASELINES.STATS)
                .set(BASELINES.UPDATED_AT, t)
                .execute();
    }

    public void delete(UUID applianceId) {
        dsl.deleteFrom(BASELINES).where(BASELINES.APPLIANCE_ID.eq(applianceId)).execute();
    }

    public void saveReady(UUID applianceId, Baseline stats, Instant now) {
        OffsetDateTime t = now.atOffset(ZoneOffset.UTC);
        dsl.update(BASELINES)
                .set(BASELINES.STATUS, Status.READY.name())
                .set(BASELINES.LEARNED_AT, t)
                .set(BASELINES.STATS, JSON.valueOf(json.writeValueAsString(stats)))
                .set(BASELINES.UPDATED_AT, t)
                .where(BASELINES.APPLIANCE_ID.eq(applianceId))
                .execute();
    }
}
