package com.personalplatform.mcp.server;

import com.personalplatform.mcp.audit.ToolCallAudit.Outcome;
import io.modelcontextprotocol.spec.McpSchema.CallToolResult;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Tool failures are MCP tool errors ({@code isError: true}), never data: the text says what went wrong and
 * {@code structuredContent.error.code} is machine readable. The audit derives its outcome from that code.
 */
public final class ToolErrors {

    public static final String FORBIDDEN = "forbidden";
    public static final String API_KEY_NOT_SUPPORTED = "api_key_not_supported";
    public static final String DOWNSTREAM_DENIED = "downstream_denied";
    public static final String INVALID_INPUT = "invalid_input";
    public static final String NOT_FOUND = "not_found";
    public static final String DOWNSTREAM_REJECTED = "downstream_rejected";
    public static final String UNAVAILABLE = "unavailable";
    public static final String INTERNAL = "internal";

    private ToolErrors() {}

    public static CallToolResult error(String code, String message, Map<String, Object> extra) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("code", code);
        error.put("message", message);
        error.putAll(extra);
        return CallToolResult.builder()
                .isError(true)
                .addTextContent(message)
                .structuredContent(Map.of("error", error))
                .build();
    }

    public static CallToolResult error(String code, String message) {
        return error(code, message, Map.of());
    }

    /** The audit outcome for an error code. */
    public static Outcome outcome(String code) {
        if (code == null) {
            return Outcome.ERROR;
        }
        return switch (code) {
            case FORBIDDEN, API_KEY_NOT_SUPPORTED, DOWNSTREAM_DENIED -> Outcome.DENIED;
            case INVALID_INPUT, NOT_FOUND, DOWNSTREAM_REJECTED -> Outcome.INVALID;
            default -> Outcome.ERROR;
        };
    }

    /** The {@code structuredContent.error.code} of an error result, or null. */
    static String codeOf(CallToolResult result) {
        if (result.structuredContent() instanceof Map<?, ?> sc && sc.get("error") instanceof Map<?, ?> err
                && err.get("code") instanceof String code) {
            return code;
        }
        return null;
    }
}
