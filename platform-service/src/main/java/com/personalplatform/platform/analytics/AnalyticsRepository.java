package com.personalplatform.platform.analytics;

import static org.jooq.impl.DSL.coalesce;
import static org.jooq.impl.DSL.countDistinct;
import static org.jooq.impl.DSL.field;
import static org.jooq.impl.DSL.max;
import static org.jooq.impl.DSL.name;
import static org.jooq.impl.DSL.sum;
import static org.jooq.impl.DSL.table;
import static org.jooq.impl.DSL.val;

import com.personalplatform.platform.analytics.Dtos.SeriesPoint;
import com.personalplatform.platform.analytics.Dtos.ServiceUsage;
import com.personalplatform.platform.analytics.Dtos.TopUser;
import com.personalplatform.platform.analytics.Dtos.UsageSummary;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jooq.Condition;
import org.jooq.DSLContext;
import org.jooq.Field;
import org.jooq.Record;
import org.jooq.Table;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;

/**
 * Reads the {@code usage_1m / usage_1h / usage_1d} real-time continuous aggregates (their column layout is documented in
 * {@code platform_ext/V101__usage_aggregates.sql}). The view name always comes from {@link Resolution}, never from input.
 */
@Repository
class AnalyticsRepository {

    private static final Field<OffsetDateTime> BUCKET = field(name("bucket"), OffsetDateTime.class);
    private static final Field<String> SERVICE = field(name("service"), String.class);
    private static final Field<String> PRINCIPAL_TYPE = field(name("principal_type"), String.class);
    private static final Field<String> PRINCIPAL_ID = field(name("principal_id"), String.class);
    private static final Field<Integer> STATUS_CLASS = field(name("status_class"), Integer.class);
    private static final Field<Long> REQUESTS = field(name("requests"), Long.class);
    private static final Field<Long> LATENCY_MAX = field(name("latency_max_ms"), Long.class);
    /** The nine disjoint latency bucket columns, in bound order (see {@link Percentiles#UPPER_BOUNDS_MS}). */
    private static final List<Field<Long>> LATENCY_BUCKETS = List.of("lat_0_10", "lat_10_25", "lat_25_50", "lat_50_100",
            "lat_100_250", "lat_250_500", "lat_500_1000", "lat_1000_2500", "lat_2500_inf").stream()
            .map(c -> field(name(c), Long.class)).toList();

    private final DSLContext dsl;

    AnalyticsRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    UsageSummary summary(Resolution resolution, Instant from, Instant to, String service, String principalId) {
        Table<?> view = table(name("platform", resolution.view()));
        // buckets that overlap [from, to): the one containing `from` is included, the one starting at `to` is not
        Condition where = BUCKET.ge(utc(resolution.floor(from))).and(BUCKET.lt(utc(to)));
        if (service != null) {
            where = where.and(SERVICE.eq(service));
        }
        if (principalId != null) {
            where = where.and(PRINCIPAL_ID.eq(principalId));
        }

        // 1) totals, errors (5xx), the latency histogram, distinct users
        var select = new ArrayList<org.jooq.SelectFieldOrAsterisk>();
        select.add(longSum(REQUESTS));
        select.add(longSum(REQUESTS, STATUS_CLASS.eq(5)));
        select.add(countDistinct(PRINCIPAL_ID).filterWhere(PRINCIPAL_TYPE.eq("USER")));
        select.add(max(LATENCY_MAX));
        LATENCY_BUCKETS.forEach(b -> select.add(longSum(b)));
        Record totals = dsl.select(select).from(view).where(where).fetchOne();
        long total = number(totals.get(0));
        long errors = number(totals.get(1));
        long activeUsers = number(totals.get(2));
        long maxLatency = number(totals.get(3));
        long[] histogram = new long[LATENCY_BUCKETS.size()];
        for (int i = 0; i < histogram.length; i++) {
            histogram[i] = number(totals.get(4 + i));
        }

        // 2) per service
        List<ServiceUsage> byService = dsl.select(SERVICE, longSum(REQUESTS), longSum(REQUESTS, STATUS_CLASS.eq(5)))
                .from(view).where(where).groupBy(SERVICE)
                .orderBy(DSL.sum(REQUESTS).desc(), SERVICE)
                .fetch(r -> new ServiceUsage(r.value1(), number(r.value2()), number(r.value3())));

        // 3) per status class ("2xx": n), only classes that saw traffic
        Map<String, Long> byStatusClass = new LinkedHashMap<>();
        dsl.select(STATUS_CLASS, longSum(REQUESTS)).from(view).where(where).groupBy(STATUS_CLASS).orderBy(STATUS_CLASS)
                .forEach(r -> byStatusClass.put(r.value1() + "xx", number(r.value2())));

        // 4) time series, oldest first
        List<SeriesPoint> series = dsl.select(BUCKET, longSum(REQUESTS), longSum(REQUESTS, STATUS_CLASS.eq(5)))
                .from(view).where(where).groupBy(BUCKET).orderBy(BUCKET)
                .fetch(r -> new SeriesPoint(r.value1().toInstant(), number(r.value2()), number(r.value3())));

        boolean any = total > 0;
        return new UsageSummary(total, any ? (double) errors / total : 0.0,
                any ? Percentiles.estimate(histogram, maxLatency, 0.50) : null,
                any ? Percentiles.estimate(histogram, maxLatency, 0.95) : null,
                activeUsers, byService, byStatusClass, series, from, to, resolution.label());
    }

    List<TopUser> topUsers(Resolution resolution, Instant from, Instant to, int limit) {
        Table<?> view = table(name("platform", resolution.view()));
        Condition where = BUCKET.ge(utc(resolution.floor(from))).and(BUCKET.lt(utc(to)))
                .and(PRINCIPAL_TYPE.ne("ANON"));
        return dsl.select(PRINCIPAL_TYPE, PRINCIPAL_ID, longSum(REQUESTS), longSum(REQUESTS, STATUS_CLASS.eq(5)))
                .from(view).where(where).groupBy(PRINCIPAL_TYPE, PRINCIPAL_ID)
                .orderBy(DSL.sum(REQUESTS).desc(), PRINCIPAL_ID, PRINCIPAL_TYPE)
                .limit(limit)
                .fetch(r -> new TopUser(r.value1(), r.value2(), number(r.value3()), number(r.value4())));
    }

    private static Field<BigDecimal> longSum(Field<Long> field) {
        return coalesce(sum(field), BigDecimal.ZERO);
    }

    private static Field<BigDecimal> longSum(Field<Long> field, Condition filter) {
        return coalesce(sum(field).filterWhere(filter), BigDecimal.ZERO);
    }

    private static long number(Object value) {
        return value instanceof Number n ? n.longValue() : 0;
    }

    private static Field<OffsetDateTime> utc(Instant instant) {
        return val(OffsetDateTime.ofInstant(instant, ZoneOffset.UTC));
    }
}
