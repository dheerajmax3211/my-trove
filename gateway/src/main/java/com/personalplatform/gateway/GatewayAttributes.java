package com.personalplatform.gateway;

/** Names of the exchange attributes the gateway's filters use to talk to each other. */
public final class GatewayAttributes {

    /** {@link com.personalplatform.gateway.security.CallerIdentity} of the request, set once the caller is known. */
    public static final String IDENTITY = GatewayAttributes.class.getName() + ".identity";

    /** Request correlation id, also sent downstream and returned to the caller. */
    public static final String REQUEST_ID = GatewayAttributes.class.getName() + ".requestId";

    /** Pattern of the passthrough rule that matched, when the request bypassed the exchange. */
    public static final String PASSTHROUGH_PATTERN = GatewayAttributes.class.getName() + ".passthroughPattern";

    /** Set to {@code Boolean.TRUE} when the gateway answered 429. */
    public static final String RATE_LIMITED = GatewayAttributes.class.getName() + ".rateLimited";

    private GatewayAttributes() {}
}
