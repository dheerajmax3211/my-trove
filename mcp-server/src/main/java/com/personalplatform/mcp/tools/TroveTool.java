package com.personalplatform.mcp.tools;

import java.util.Map;

/**
 * One read-only MCP tool. The registry checks {@link #requiredPermission()} before {@link #call} runs, turns
 * {@link ToolInputException} and downstream failures into MCP tool errors, and the audit records every call.
 */
public interface TroveTool {

    String name();

    String title();

    String description();

    /** JSON Schema of the arguments object (draft 2020-12 keywords the SDK validator understands). */
    Map<String, Object> inputSchema();

    /** The product permission the caller's token must carry, e.g. {@code products:use}. */
    String requiredPermission();

    /** Runs the tool; {@code arguments} is never null. */
    ToolOutput call(Map<String, Object> arguments, Caller caller);

    /**
     * What a successful call returns.
     *
     * @param text       human-readable summary (MCP {@code content[0].text})
     * @param structured the same data as JSON (MCP {@code structuredContent})
     */
    record ToolOutput(String text, Map<String, Object> structured) {}
}
