package com.personalplatform.mcp.tools;

import com.personalplatform.mcp.config.McpProperties;
import com.personalplatform.mcp.tools.Downstream.DownstreamException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/**
 * Open Waiting On items (OPEN, NUDGED, ESCALATED) with their status and the follow-up workflow's next step.
 * The list endpoint does not carry the workflow state, so each item's detail is read too (bounded by {@code limit}).
 */
@Component
public class WaitingOnFollowupsTool implements TroveTool {

    static final int MAX = 20;

    private final Downstream downstream;

    public WaitingOnFollowupsTool(Downstream downstream) {
        this.downstream = downstream;
    }

    @Override
    public String name() {
        return "waiting_on_list_followups";
    }

    @Override
    public String title() {
        return "Waiting On: open follow-ups";
    }

    @Override
    public String description() {
        return "Lists the caller's open Waiting On items (refunds, claims, approvals they are owed) with their status "
                + "and the next follow-up step the workflow will take, and when.";
    }

    @Override
    public Map<String, Object> inputSchema() {
        return Args.object(Map.of("limit", Args.integerSchema("How many items to return (newest first)", 1, MAX, 10)));
    }

    @Override
    public String requiredPermission() {
        return "products:use";
    }

    @Override
    public ToolOutput call(Map<String, Object> arguments, Caller caller) {
        Args.onlyKnown(arguments, Set.of("limit"));
        int limit = Args.integer(arguments, "limit", 1, MAX, 10);
        JsonNode items = downstream.get(McpProperties.WAITING_ON, downstream.uri(McpProperties.WAITING_ON)
                .path("/v1/items")
                .queryParam("status", "OPEN", "NUDGED", "ESCALATED")
                .queryParam("limit", limit)
                .build().toUri(), caller);

        List<Map<String, Object>> out = new ArrayList<>();
        StringBuilder text = new StringBuilder();
        for (JsonNode item : items) {
            String id = Args.text(item, "id");
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", id);
            row.put("title", Args.text(item, "title"));
            row.put("counterparty", Args.text(item, "counterparty"));
            row.put("status", Args.text(item, "status"));
            row.put("expectedBy", Args.text(item, "expectedBy"));
            row.put("amount", Args.text(item, "amount"));
            row.put("currency", Args.text(item, "currency"));
            Map<String, Object> next = nextStep(id, caller);
            row.put("nextStep", next);
            out.add(row);
            text.append("- ").append(row.get("title")).append(" (").append(row.get("counterparty")).append("): ")
                    .append(row.get("status"));
            if (next != null) {
                text.append(", next ").append(next.get("action"));
                if (next.get("at") != null) {
                    text.append(" at ").append(next.get("at"));
                }
            }
            text.append('\n');
        }
        String summary = out.isEmpty() ? "No open follow-ups." : out.size() + " open follow-up(s):\n" + text;
        return new ToolOutput(summary.strip(), Map.of("items", out, "count", out.size()));
    }

    /** The workflow's next step, or null when the workflow state cannot be read right now. */
    private Map<String, Object> nextStep(String id, Caller caller) {
        if (id == null) {
            return null;
        }
        try {
            JsonNode detail = downstream.get(McpProperties.WAITING_ON, downstream.uri(McpProperties.WAITING_ON)
                    .path("/v1/items/{id}").buildAndExpand(id).toUri(), caller);
            JsonNode followUp = detail.get("followUp");
            if (followUp == null || followUp.isNull()) {
                return null;
            }
            Map<String, Object> next = new LinkedHashMap<>();
            next.put("stage", Args.text(followUp, "stage"));
            next.put("action", Args.text(followUp, "nextAction"));
            next.put("at", Args.text(followUp, "nextActionAt"));
            return next;
        } catch (DownstreamException e) {
            if (e.failure() == Downstream.Failure.DENIED) {
                throw e;
            }
            return null;
        }
    }
}
