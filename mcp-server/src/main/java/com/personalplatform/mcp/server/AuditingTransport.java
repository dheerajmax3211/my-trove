package com.personalplatform.mcp.server;

import com.personalplatform.mcp.audit.ToolCallAudit;
import com.personalplatform.mcp.audit.ToolCallAudit.Outcome;
import com.personalplatform.mcp.tools.Caller;
import io.modelcontextprotocol.common.McpTransportContext;
import io.modelcontextprotocol.json.McpJsonMapper;
import io.modelcontextprotocol.server.McpStatelessServerHandler;
import io.modelcontextprotocol.spec.McpSchema;
import io.modelcontextprotocol.spec.McpSchema.CallToolResult;
import io.modelcontextprotocol.spec.McpSchema.JSONRPCResponse;
import io.modelcontextprotocol.spec.McpStatelessServerTransport;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import reactor.core.publisher.Mono;

/**
 * Sits between the servlet transport and the SDK's request handler so that every {@code tools/call} is audited,
 * including the ones the SDK answers itself (unknown tool, arguments that fail the input schema), not only those that
 * reach a tool. The audit row is written before the response leaves; if the write fails, the call fails.
 */
final class AuditingTransport implements McpStatelessServerTransport {

    static final String TOOLS_CALL = "tools/call";

    private final McpStatelessServerTransport delegate;
    private final ToolCallAudit audit;
    private final McpJsonMapper json;
    private final Supplier<Set<String>> knownTools;

    AuditingTransport(McpStatelessServerTransport delegate, ToolCallAudit audit, McpJsonMapper json,
            Supplier<Set<String>> knownTools) {
        this.delegate = delegate;
        this.audit = audit;
        this.json = json;
        this.knownTools = knownTools;
    }

    @Override
    public void setMcpHandler(McpStatelessServerHandler handler) {
        delegate.setMcpHandler(new McpStatelessServerHandler() {
            @Override
            public Mono<JSONRPCResponse> handleRequest(McpTransportContext ctx, McpSchema.JSONRPCRequest request) {
                if (!TOOLS_CALL.equals(request.method())) {
                    return handler.handleRequest(ctx, request);
                }
                long start = System.nanoTime();
                return handler.handleRequest(ctx, request)
                        .map(response -> {
                            record(ctx, request, response, start);
                            return response;
                        })
                        .onErrorResume(e -> {
                            if (!(e instanceof AuditFailure)) {
                                record(ctx, request, null, start);
                            }
                            return Mono.error(e);
                        });
            }

            @Override
            public Mono<Void> handleNotification(McpTransportContext ctx, McpSchema.JSONRPCNotification notification) {
                return handler.handleNotification(ctx, notification);
            }
        });
    }

    private void record(McpTransportContext ctx, McpSchema.JSONRPCRequest request, JSONRPCResponse response, long start) {
        String tool = null;
        Object arguments = null;
        if (request.params() instanceof Map<?, ?> params) {
            tool = params.get("name") instanceof String s ? s : null;
            arguments = params.get("arguments");
        }
        Outcome outcome;
        String code = null;
        int bytes = 0;
        if (response == null) {
            outcome = Outcome.ERROR;
            code = "exception";
        } else if (response.error() != null) {
            bytes = size(response.error());
            code = "jsonrpc_" + response.error().code();
            outcome = tool == null || !knownTools.get().contains(tool) ? Outcome.UNKNOWN_TOOL
                    : response.error().code() != null && response.error().code() == McpSchema.ErrorCodes.INVALID_PARAMS
                            ? Outcome.INVALID : Outcome.ERROR;
        } else {
            bytes = size(response.result());
            CallToolResult result = response.result() instanceof CallToolResult r ? r : null;
            if (result != null && Boolean.TRUE.equals(result.isError())) {
                code = ToolErrors.codeOf(result);
                // An error result without our code comes from the SDK itself: its input-schema validation.
                outcome = code == null ? Outcome.INVALID : ToolErrors.outcome(code);
                code = code == null ? "schema_validation" : code;
            } else {
                outcome = Outcome.OK;
            }
        }
        Caller caller = ctx.get(ToolRegistry.CALLER) instanceof Caller c ? c : null;
        try {
            audit.record(new ToolCallAudit.Entry(caller, tool, arguments, bytes, outcome, code,
                    (System.nanoTime() - start) / 1_000_000));
        } catch (RuntimeException e) {
            throw new AuditFailure(e);
        }
    }

    private int size(Object value) {
        try {
            return json.writeValueAsBytes(value).length;
        } catch (IOException e) {
            return 0;
        }
    }

    @Override
    public Mono<Void> closeGracefully() {
        return delegate.closeGracefully();
    }

    @Override
    public void close() {
        delegate.close();
    }

    @Override
    public List<String> protocolVersions() {
        return delegate.protocolVersions();
    }

    /** The audit row could not be written; the call is failed rather than answered unaudited. */
    static final class AuditFailure extends RuntimeException {
        AuditFailure(Throwable cause) {
            super("audit write failed", cause);
        }
    }
}
