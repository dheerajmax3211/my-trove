package com.personalplatform.mcp.server;

import com.personalplatform.mcp.tools.Caller;
import com.personalplatform.mcp.tools.Downstream.DownstreamException;
import com.personalplatform.mcp.tools.OwnerDelegation;
import com.personalplatform.mcp.tools.OwnerDelegation.DelegationException;
import com.personalplatform.mcp.tools.ToolInputException;
import com.personalplatform.mcp.tools.TroveTool;
import io.modelcontextprotocol.common.McpTransportContext;
import io.modelcontextprotocol.server.McpStatelessServerFeatures.SyncToolSpecification;
import io.modelcontextprotocol.spec.McpSchema.CallToolRequest;
import io.modelcontextprotocol.spec.McpSchema.CallToolResult;
import io.modelcontextprotocol.spec.McpSchema.Tool;
import io.modelcontextprotocol.spec.McpSchema.ToolAnnotations;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Turns each {@link TroveTool} into an SDK tool specification and puts the consent checks in front of it: the
 * caller's token must carry the tool's product permission. A person's call goes to the tool with their own token. An
 * API key's call (its service token must carry the permission too, so a key without the scope never gets further) is
 * first turned into its owner through auth's delegated-token endpoint, and the delegated token, which holds only what
 * both the owner and the key hold, must carry the permission as well. Every refusal is a tool error.
 */
@Component
public class ToolRegistry {

    /** Key of the {@link Caller} in the MCP transport context (set by the context extractor from the request). */
    public static final String CALLER = "trove.caller";

    private static final Logger log = LoggerFactory.getLogger(ToolRegistry.class);

    private final List<TroveTool> tools;
    private final OwnerDelegation delegation;

    public ToolRegistry(List<TroveTool> tools, OwnerDelegation delegation) {
        this.tools = List.copyOf(tools);
        this.delegation = delegation;
    }

    public Set<String> names() {
        return tools.stream().map(TroveTool::name).collect(Collectors.toUnmodifiableSet());
    }

    public List<SyncToolSpecification> specifications() {
        return tools.stream().map(this::specification).toList();
    }

    private SyncToolSpecification specification(TroveTool tool) {
        Tool definition = Tool.builder()
                .name(tool.name())
                .title(tool.title())
                .description(tool.description())
                .inputSchema(tool.inputSchema())
                .annotations(new ToolAnnotations(tool.title(), true, false, true, false, null))
                .build();
        return SyncToolSpecification.builder()
                .tool(definition)
                .callHandler((ctx, request) -> call(tool, ctx, request))
                .build();
    }

    CallToolResult call(TroveTool tool, McpTransportContext ctx, CallToolRequest request) {
        Caller caller = ctx.get(CALLER) instanceof Caller c ? c : null;
        if (caller == null) {
            return ToolErrors.error(ToolErrors.FORBIDDEN, "No authenticated caller.");
        }
        if (!caller.permissions().contains(tool.requiredPermission())) {
            return ToolErrors.error(ToolErrors.FORBIDDEN,
                    "This tool needs the permission '" + tool.requiredPermission() + "', which your token does not carry.",
                    Map.of("requiredPermission", tool.requiredPermission()));
        }
        Caller actor = caller;
        if (caller.type() == Caller.Type.API_KEY) {
            try {
                actor = delegation.delegate(caller);
            } catch (DelegationException e) {
                return e.refused()
                        ? ToolErrors.error(ToolErrors.DELEGATION_REFUSED, e.getMessage(),
                                e.reason() == null ? Map.of() : Map.of("reason", e.reason()))
                        : ToolErrors.error(ToolErrors.UNAVAILABLE, e.getMessage() + "; try again shortly.");
            }
            // The owner may lack the permission the key carries: the delegated token holds only what both hold.
            if (!actor.permissions().contains(tool.requiredPermission())) {
                return ToolErrors.error(ToolErrors.FORBIDDEN,
                        "This tool needs the permission '" + tool.requiredPermission()
                                + "', which the key's owner does not hold.",
                        Map.of("requiredPermission", tool.requiredPermission()));
            }
        }
        try {
            Map<String, Object> args = request.arguments() == null ? Map.of() : request.arguments();
            TroveTool.ToolOutput out = tool.call(args, actor);
            return CallToolResult.builder()
                    .addTextContent(out.text())
                    .structuredContent(out.structured())
                    .isError(false)
                    .build();
        } catch (ToolInputException e) {
            return ToolErrors.error(ToolErrors.INVALID_INPUT, e.getMessage());
        } catch (DownstreamException e) {
            return switch (e.failure()) {
                case DENIED -> ToolErrors.error(ToolErrors.DOWNSTREAM_DENIED, e.getMessage());
                case NOT_FOUND -> ToolErrors.error(ToolErrors.NOT_FOUND, e.getMessage());
                case REJECTED -> ToolErrors.error(ToolErrors.DOWNSTREAM_REJECTED, e.getMessage());
                case UNAVAILABLE -> ToolErrors.error(ToolErrors.UNAVAILABLE, e.getMessage() + "; try again shortly.");
            };
        } catch (RuntimeException e) {
            log.warn("tool {} failed: {}", tool.name(), e.toString());
            return ToolErrors.error(ToolErrors.INTERNAL, "The tool failed unexpectedly.");
        }
    }
}
