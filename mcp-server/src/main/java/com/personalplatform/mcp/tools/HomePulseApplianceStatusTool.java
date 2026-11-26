package com.personalplatform.mcp.tools;

import com.personalplatform.mcp.config.McpProperties;
import com.personalplatform.mcp.tools.Downstream.DownstreamException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/** Each of the caller's Home Pulse appliances with its health status and its open (unresolved) alerts. */
@Component
public class HomePulseApplianceStatusTool implements TroveTool {

    /** Health is read per appliance; a household with more than this is cut off (and says so). */
    static final int MAX_APPLIANCES = 25;

    private final Downstream downstream;

    public HomePulseApplianceStatusTool(Downstream downstream) {
        this.downstream = downstream;
    }

    @Override
    public String name() {
        return "home_pulse_appliance_status";
    }

    @Override
    public String title() {
        return "Home Pulse: appliance status";
    }

    @Override
    public String description() {
        return "Lists the caller's appliances with their health (HEALTHY, WARNING, CRITICAL, LEARNING, NO_DEVICE) and "
                + "open alerts. Pass applianceId to look at one appliance.";
    }

    @Override
    public Map<String, Object> inputSchema() {
        return Args.object(Map.of("applianceId", Args.uuidSchema("Only this appliance")));
    }

    @Override
    public String requiredPermission() {
        return "products:use";
    }

    @Override
    public ToolOutput call(Map<String, Object> arguments, Caller caller) {
        Args.onlyKnown(arguments, Set.of("applianceId"));
        UUID only = Args.optionalUuid(arguments, "applianceId");
        List<JsonNode> appliances = new ArrayList<>();
        if (only != null) {
            appliances.add(downstream.get(McpProperties.HOME_PULSE, downstream.uri(McpProperties.HOME_PULSE)
                    .path("/v1/appliances/{id}").buildAndExpand(only).toUri(), caller));
        } else {
            JsonNode all = downstream.get(McpProperties.HOME_PULSE, downstream.uri(McpProperties.HOME_PULSE)
                    .path("/v1/appliances").build().toUri(), caller);
            all.forEach(appliances::add);
        }
        boolean truncated = appliances.size() > MAX_APPLIANCES;
        List<Map<String, Object>> out = new ArrayList<>();
        StringBuilder text = new StringBuilder();
        for (JsonNode a : appliances.subList(0, Math.min(appliances.size(), MAX_APPLIANCES))) {
            String id = Args.text(a, "id");
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", id);
            row.put("name", Args.text(a, "name"));
            row.put("type", Args.text(a, "type"));
            row.put("location", Args.text(a, "location"));
            row.put("underWarranty", a.path("underWarranty").asBoolean());
            row.put("serviceOverdue", a.path("serviceOverdue").asBoolean());
            List<Map<String, Object>> alerts = new ArrayList<>();
            String status = "UNKNOWN";
            JsonNode health = health(id, caller);
            if (health != null) {
                status = Args.text(health, "status");
                row.put("lastReadingAt", Args.text(health, "lastReadingAt"));
                JsonNode active = health.get("activeAlerts");
                if (active != null) {
                    for (JsonNode alert : active) {
                        Map<String, Object> al = new LinkedHashMap<>();
                        al.put("id", Args.text(alert, "id"));
                        al.put("kind", Args.text(alert, "kind"));
                        al.put("severity", Args.text(alert, "severity"));
                        al.put("status", Args.text(alert, "status"));
                        al.put("message", Args.text(alert, "message"));
                        al.put("openedAt", Args.text(alert, "openedAt"));
                        alerts.add(al);
                    }
                }
            }
            row.put("health", status);
            row.put("openAlerts", alerts);
            out.add(row);
            text.append("- ").append(row.get("name")).append(": ").append(status);
            if (!alerts.isEmpty()) {
                text.append(", ").append(alerts.size()).append(" open alert(s): ");
                text.append(String.join("; ", alerts.stream().map(x -> String.valueOf(x.get("message"))).toList()));
            }
            text.append('\n');
        }
        String summary = out.isEmpty() ? "No appliances." : text.toString().strip();
        if (truncated) {
            summary += "\n(showing the first " + MAX_APPLIANCES + " of " + appliances.size() + " appliances)";
        }
        return new ToolOutput(summary, Map.of("appliances", out, "count", out.size(), "truncated", truncated));
    }

    /** The appliance's health, or null when Home Pulse cannot compute it right now. */
    private JsonNode health(String id, Caller caller) {
        if (id == null) {
            return null;
        }
        try {
            return downstream.get(McpProperties.HOME_PULSE, downstream.uri(McpProperties.HOME_PULSE)
                    .path("/v1/appliances/{id}/health").buildAndExpand(id).toUri(), caller);
        } catch (DownstreamException e) {
            if (e.failure() == Downstream.Failure.DENIED) {
                throw e;
            }
            return null;
        }
    }
}
