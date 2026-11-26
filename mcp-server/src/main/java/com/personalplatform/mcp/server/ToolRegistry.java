package com.personalplatform.mcp.server;

import com.personalplatform.mcp.tools.Caller;
import com.personalplatform.mcp.tools.Downstream.DownstreamException;
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
 * Turns each {@link TroveTool} into an SDK tool specification and puts the consent checks in front of it:
 * the caller's token must carry the tool's product permission, and the caller must be a person (an API key's
 * service token does not act as its owner, so it has no product data to read). Both refusals are tool errors.
 */
@Component
public class ToolRegistry {

    /** Key of the {@link Caller} in the MCP transport context (set by the context extractor from the request). */
    public static final String CALLER = "trove.caller";

    private static final Logger log = LoggerFactory.getLogger(ToolRegistry.class);

    private final List<TroveTool> tools;

    public ToolRegistry(List<TroveTool> tools) {
        this.tools = List.copyOf(tools);
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
        if (caller.type() == Caller.Type.API_KEY) {
            return ToolErrors.error(ToolErrors.API_KEY_NOT_SUPPORTED,
                    "API keys can connect and list tools, but cannot read personal product data: a key's token does not "
                            + "act as its owner. Sign in as yourself to use this tool.");
        }
        try {
            Map<String, Object> args = request.arguments() == null ? Map.of() : request.arguments();
            TroveTool.ToolOutput out = tool.call(args, caller);
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
