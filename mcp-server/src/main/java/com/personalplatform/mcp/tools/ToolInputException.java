package com.personalplatform.mcp.tools;

/** The arguments do not satisfy the tool's contract; the message is shown to the agent. */
public class ToolInputException extends RuntimeException {

    public ToolInputException(String message) {
        super(message);
    }
}
