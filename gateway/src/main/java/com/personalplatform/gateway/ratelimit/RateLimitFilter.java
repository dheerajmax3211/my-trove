package com.personalplatform.gateway.ratelimit;

import com.personalplatform.gateway.ClientIp;
import com.personalplatform.gateway.GatewayAttributes;
import com.personalplatform.gateway.security.CallerIdentity;
import java.time.Clock;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * After the exchange: applies the per-minute limit for the caller's plan (keyed by principal id, or by the TCP peer
 * address for anonymous and passthrough callers) and then the monthly quota for identified principals.
 */
@Component
public class RateLimitFilter implements GlobalFilter, Ordered {

    /** Right after {@link com.personalplatform.gateway.security.ExchangeFilter#ORDER}. */
    public static final int ORDER = -150;

    private final RateLimiter limiter;
    private final PlanLimits plans;
    private final QuotaClient quota;
    private final Clock clock;

    public RateLimitFilter(RateLimiter limiter, PlanLimits plans, QuotaClient quota, Clock clock) {
        this.limiter = limiter;
        this.plans = plans;
        this.quota = quota;
        this.clock = clock;
    }

    @Override
    public int getOrder() {
        return ORDER;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        CallerIdentity identity = exchange.getAttribute(GatewayAttributes.IDENTITY);
        if (identity == null) {
            return chain.filter(exchange);
        }
        String key = identity.authenticated() ? "p:" + identity.principalId() : ipKey(exchange);
        String plan = identity.authenticated() ? identity.plan() : PlanLimits.DEFAULT_PLAN;
        RateLimiter.Decision decision = limiter.tryConsume(key, plans.requestsPerMinute(plan));
        if (!decision.allowed()) {
            return RateLimiter.reject(exchange, decision);
        }
        RateLimiter.describe(exchange, decision);

        if (identity.authenticated()) {
            QuotaClient.Verdict verdict = quota.admit(identity.principalId());
            if (verdict.exceeded()) {
                return RateLimiter.rejectQuota(exchange, verdict.limit(),
                        QuotaClient.secondsUntilNextMonth(clock.instant()));
            }
        }
        return chain.filter(exchange);
    }

    /** Key and limit for a caller that failed to authenticate: same bucket as its anonymous traffic. */
    public static String ipKey(ServerWebExchange exchange) {
        return "ip:" + ClientIp.of(exchange);
    }
}
