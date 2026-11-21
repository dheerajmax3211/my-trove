package com.personalplatform.platform.plans;

import static com.personalplatform.sql.jooq.platform.platform.tables.Plans.PLANS;
import static com.personalplatform.sql.jooq.platform.platform.tables.UsageEvents.USAGE_EVENTS;

import com.personalplatform.platform.web.BadRequestException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Service;

/**
 * Plans and monthly quotas for the gateway ({@code /internal/v1/...}).
 *
 * <p>A principal's plan is the one on its most recent usage event (events carry the plan from the platform token),
 * {@code FREE} for a principal never seen; the caller may pass the plan it knows from the token to override that, which
 * matters right after an upgrade, before the first event on the new plan exists. {@code used} is the number of
 * requests actually served in the current UTC calendar month: the daily aggregate (real-time, so the materialized days
 * plus today's raw rows) minus the requests the gateway rejected as rate limited.
 */
@Service
public class QuotaService {

    static final String DEFAULT_PLAN = "FREE";

    private final DSLContext dsl;
    private final Clock clock;

    QuotaService(DSLContext dsl, Clock clock) {
        this.dsl = dsl;
        this.clock = clock;
    }

    public record Plan(String plan, int requestsPerMinute, long requestsPerMonth, int maxApiKeys, int maxWebhooks) {
    }

    public record Quota(String plan, long monthlyLimit, long used) {
    }

    public List<Plan> plans() {
        return dsl.selectFrom(PLANS).orderBy(PLANS.REQUESTS_PER_MINUTE)
                .fetch(r -> new Plan(r.getName(), r.getRequestsPerMinute(), r.getRequestsPerMonth(), r.getMaxApiKeys(),
                        r.getMaxWebhooks()));
    }

    public Quota quota(String principalId, String planOverride) {
        Plan plan = planOverride != null ? requirePlan(planOverride) : planFor(principalId);
        return new Quota(plan.plan(), plan.requestsPerMonth(), usedThisMonth(principalId));
    }

    private Plan requirePlan(String name) {
        return find(name).orElseThrow(() -> new BadRequestException("Unknown plan '" + name + "'"));
    }

    private Plan planFor(String principalId) {
        String latest = dsl.select(USAGE_EVENTS.PLAN).from(USAGE_EVENTS)
                .where(USAGE_EVENTS.PRINCIPAL_ID.eq(principalId).and(USAGE_EVENTS.PLAN.isNotNull()))
                .orderBy(USAGE_EVENTS.TS.desc()).limit(1).fetchOne(USAGE_EVENTS.PLAN);
        // an event may carry a plan name that was later removed; never fail a quota check over it
        return find(latest != null ? latest : DEFAULT_PLAN).orElseGet(() -> find(DEFAULT_PLAN).orElseThrow());
    }

    private Optional<Plan> find(String name) {
        return dsl.selectFrom(PLANS).where(PLANS.NAME.eq(name)).fetchOptional(r -> new Plan(r.getName(),
                r.getRequestsPerMinute(), r.getRequestsPerMonth(), r.getMaxApiKeys(), r.getMaxWebhooks()));
    }

    private long usedThisMonth(String principalId) {
        LocalDate today = LocalDate.now(clock.withZone(ZoneOffset.UTC));
        OffsetDateTime monthStart = today.withDayOfMonth(1).atStartOfDay().atOffset(ZoneOffset.UTC);
        OffsetDateTime nextMonth = monthStart.plusMonths(1);
        // typed bind values: plain-SQL placeholders would send the timestamps as varchar
        Object used = dsl.fetchValue(
                "select coalesce(sum(requests - rate_limited), 0) from platform.usage_1d "
                        + "where principal_id = {0} and bucket >= {1} and bucket < {2}",
                DSL.val(principalId), DSL.val(monthStart), DSL.val(nextMonth));
        return used instanceof Number n ? n.longValue() : 0;
    }
}
