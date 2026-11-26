package com.personalplatform.gateway.support;

import com.personalplatform.gateway.support.StubServer.Received;
import com.personalplatform.gateway.support.StubServer.Reply;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.test.context.DynamicPropertyRegistry;

/**
 * One stub per downstream service plus the contract stubs: {@code auth} answers {@code POST /v1/token/exchange}
 * and {@code platform} answers {@code GET /internal/v1/plans} and {@code /internal/v1/quota/{id}}.
 *
 * <p>Credentials understood by the exchange stub: {@code u|<uid>|<PLAN>|<perm,perm>} (platform token),
 * {@code svc|<appId>|<PLAN>[|<perm,perm>]} (service token, as an API key exchange gives), {@code suspended} (403), {@code unauthorized} (401), {@code boom} (500).
 */
public final class Backends {

    public static final String INTERNAL_KEY = "test-internal-key";
    public static final String MEMBER = "u|alice|FREE|products:use,usage:read:self,connections:manage";
    public static final String PRO = "u|pro-bob|PRO|products:use,usage:read:self,connections:manage";
    public static final String NO_PRODUCTS = "u|carol|FREE|usage:read:self";
    /** A DEVELOPER-like user: MEMBER permissions plus mcp:use. */
    public static final String MCP_USER = "u|dave|FREE|products:use,usage:read:self,connections:manage,mcp:use";
    public static final String SUSPENDED = "suspended";
    public static final String UNAUTHORIZED = "unauthorized";
    public static final String BOOM = "boom";

    public static final List<String> SERVICES = List.of("auth", "shared", "waiting-on", "consent", "home-pulse",
            "ask-your-life", "digital-legacy", "family-treasury", "platform", "mcp");

    public static final String SEED_PLANS = "[{\"plan\":\"FREE\",\"requestsPerMinute\":120,\"requestsPerMonth\":10000},"
            + "{\"plan\":\"PRO\",\"requestsPerMinute\":600,\"requestsPerMonth\":200000},"
            + "{\"plan\":\"DEVELOPER\",\"requestsPerMinute\":1200,\"requestsPerMonth\":1000000}]";

    private static final Backends INSTANCE = new Backends();

    private final Map<String, StubServer> servers = new LinkedHashMap<>();

    private Backends() {
        for (String s : SERVICES) {
            servers.put(s, StubServer.start(s));
        }
        resetHandlers();
        Runtime.getRuntime().addShutdownHook(new Thread(() -> servers.values().forEach(StubServer::close)));
    }

    public static Backends get() {
        return INSTANCE;
    }

    public StubServer service(String name) {
        return servers.get(name);
    }

    public StubServer auth() {
        return servers.get("auth");
    }

    public StubServer platform() {
        return servers.get("platform");
    }

    public void register(DynamicPropertyRegistry r) {
        servers.forEach((name, s) -> r.add("gateway.services." + name + ".uri", s::uri));
        r.add("gateway.internal.api-key", () -> INTERNAL_KEY);
    }

    public void reset() {
        servers.values().forEach(StubServer::clear);
        resetHandlers();
    }

    public long exchangeCalls() {
        return auth().received().stream().filter(r -> r.path().equals("/v1/token/exchange")).count();
    }

    public long exchangeCallsFor(String credential) {
        return auth().received().stream()
                .filter(r -> r.path().equals("/v1/token/exchange"))
                .filter(r -> ("Bearer " + credential).equals(r.header("authorization")))
                .count();
    }

    /** Requests the downstream services (not the auth/platform contract stubs) received. */
    public long downstreamRequests() {
        return servers.entrySet().stream()
                .filter(e -> !e.getKey().equals("auth") && !e.getKey().equals("platform"))
                .mapToLong(e -> e.getValue().received().size())
                .sum();
    }

    private void resetHandlers() {
        servers.values().forEach(StubServer::resetHandler);
        StubServer auth = auth();
        auth.handler(r -> r.path().equals("/v1/token/exchange") && r.method().equals("POST")
                ? exchange(r)
                : auth.echo(r));
        StubServer platform = platform();
        platform.handler(r -> r.path().startsWith("/internal/")
                ? internal(r, SEED_PLANS, "{\"plan\":\"FREE\",\"monthlyLimit\":10000,\"used\":0}")
                : platform.echo(r));
    }

    /** Serve the internal API with the given plans and quota bodies; wrong or missing key gives 401. */
    public Reply internal(Received r, String plansBody, String quotaBody) {
        if (!INTERNAL_KEY.equals(r.header("x-internal-key"))) {
            return Reply.problem(401, "bad internal key");
        }
        if (r.path().equals("/internal/v1/plans")) {
            return Reply.json(200, plansBody);
        }
        if (r.path().startsWith("/internal/v1/quota/")) {
            return Reply.json(200, quotaBody);
        }
        return Reply.problem(404, "not found");
    }

    private Reply exchange(Received r) {
        String authz = r.header("authorization");
        String cred = authz == null ? "" : authz.replaceFirst("(?i)^Bearer ", "");
        switch (cred) {
            case SUSPENDED:
                return Reply.problem(403, "Account suspended");
            case UNAUTHORIZED:
                return Reply.problem(401, "Invalid credential");
            case BOOM:
                return Reply.json(500, "{\"oops\":true}");
            default:
        }
        String token;
        String[] p = cred.split("\\|");
        if (p[0].equals("u") && p.length >= 4) {
            token = TestJwt.platformToken(p[1], p[2], List.of(p[3].split(",")));
        } else if (p[0].equals("svc") && p.length >= 4) {
            token = TestJwt.serviceToken(p[1], p[2], List.of(p[3].split(",")));
        } else if (p[0].equals("svc")) {
            token = TestJwt.serviceToken(p[1], p[2]);
        } else {
            return Reply.problem(401, "Invalid credential");
        }
        return Reply.json(200, "{\"accessToken\":\"" + token + "\",\"expiresIn\":600,\"tokenType\":\"Bearer\"}");
    }
}
