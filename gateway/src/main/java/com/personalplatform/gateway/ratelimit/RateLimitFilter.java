package com.personalplatform.gateway.ratelimit;

import com.personalplatform.gateway.ClientIp;
import com.personalplatform.gateway.GatewayAttributes;
import com.personalplatform.gateway.config.GatewayProperties;
import com.personalplatform.gateway.security.PrincipalType;
import com.personalplatform.gateway.security.CallerIdentity;
import java.time.Clock;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * After the exchange: applies a per-minute limit (keyed by principal id, or by the TCP peer address for anonymous and
 * passthrough callers) and then the monthly quota.
 *
 * <p>Plans meter programmatic use. API keys and consent clients get their plan's per-minute limit and monthly quota.
 * A signed-in person using the workspace gets a per-minute ceiling for abuse protection only (the higher of the
 * interactive ceiling and their plan's limit) and no monthly quota: one page of the workspace fans out to several
 * services, and nobody should be locked out of their own records for having browsed them. Their requests are still
 * metered for analytics. See docs/adr/0007-plans-meter-programmatic-use.md.
 */
@Component
public class RateLimitFilter implements GlobalFilter, Ordered {

    /** Right after {@link com.personalplatform.gateway.security.ExchangeFilter#ORDER}. */
    public static final int ORDER = -150;

    private final RateLimiter limiter;
    private final PlanLimits plans;
    private final QuotaClient quota;
    private final Clock clock;
    private final int interactivePerMinute;

    public RateLimitFilter(RateLimiter limiter, PlanLimits plans, QuotaClient quota, Clock clock,
            GatewayProperties props) {
        this.limiter = limiter;
        this.plans = plans;
        this.quota = quota;
        this.clock = clock;
        this.interactivePerMinute = props.rateLimit().interactivePerMinute();
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
        boolean interactive = identity.authenticated() && identity.type() == PrincipalType.USER;
        int perMinute = interactive
                ? Math.max(interactivePerMinute, plans.requestsPerMinute(plan))
                : plans.requestsPerMinute(plan);
        RateLimiter.Decision decision = limiter.tryConsume(key, perMinute);
        if (!decision.allowed()) {
            return RateLimiter.reject(exchange, decision);
        }
        RateLimiter.describe(exchange, decision);

        if (identity.authenticated() && !interactive) {
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
