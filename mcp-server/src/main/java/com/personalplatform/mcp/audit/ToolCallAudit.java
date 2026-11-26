package com.personalplatform.mcp.audit;

import static com.personalplatform.sql.jooq.mcp.mcp.Tables.TOOL_CALLS;

import com.personalplatform.mcp.tools.Caller;
import com.personalplatform.sql.UuidV7;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;
import org.jooq.DSLContext;
import org.springframework.stereotype.Component;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Writes one {@code mcp.tool_calls} row per {@code tools/call}: who (for an API key: its app in {@code principal_id}
 * and the owner it acts for in {@code on_behalf_of}), which tool, a SHA-256 of the canonical
 * arguments (never the arguments themselves), result size, outcome and duration. A failed write fails the call, so no
 * data leaves without its audit row.
 */
@Component
public class ToolCallAudit {

    public enum Outcome { OK, DENIED, INVALID, UNKNOWN_TOOL, ERROR }

    public record Entry(Caller caller, String tool, Object arguments, int resultBytes, Outcome outcome, String errorCode,
            long durationMs) {}

    /** Sorted keys, so the same arguments in any order hash the same. */
    private static final JsonMapper CANONICAL = JsonMapper.builder()
            .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
            .build();

    private final DSLContext dsl;

    public ToolCallAudit(DSLContext dsl) {
        this.dsl = dsl;
    }

    public void record(Entry e) {
        dsl.insertInto(TOOL_CALLS)
                .set(TOOL_CALLS.ID, UuidV7.next())
                .set(TOOL_CALLS.PRINCIPAL_TYPE, e.caller() == null ? "UNKNOWN" : e.caller().type().name())
                .set(TOOL_CALLS.PRINCIPAL_ID, e.caller() == null ? "anonymous" : truncate(e.caller().subject(), 160))
                .set(TOOL_CALLS.ON_BEHALF_OF, e.caller() == null || e.caller().onBehalfOf() == null ? null
                        : truncate(e.caller().onBehalfOf(), 160))
                .set(TOOL_CALLS.TOOL, truncate(e.tool() == null ? "(missing)" : e.tool(), 128))
                .set(TOOL_CALLS.ARGUMENTS_HASH, argumentsHash(e.arguments()))
                .set(TOOL_CALLS.RESULT_BYTES, Math.max(0, e.resultBytes()))
                .set(TOOL_CALLS.OUTCOME, e.outcome().name())
                .set(TOOL_CALLS.ERROR_CODE, e.errorCode() == null ? null : truncate(e.errorCode(), 64))
                .set(TOOL_CALLS.DURATION_MS, (int) Math.min(Integer.MAX_VALUE, Math.max(0, e.durationMs())))
                .execute();
    }

    /** SHA-256 hex of the canonical JSON of the arguments; absent arguments hash as {@code {}}. */
    public static String argumentsHash(Object arguments) {
        String canonical = CANONICAL.writeValueAsString(arguments == null ? Map.of() : arguments);
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }
}
