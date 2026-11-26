package com.personalplatform.mcp.tools;

import com.personalplatform.mcp.config.McpProperties;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Currency;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/**
 * Balances per account for the households the caller belongs to (or one of them). Family Treasury itself refuses a
 * household the caller is not a member of; that refusal comes back as a tool error.
 */
@Component
public class FamilyTreasuryLedgerSummaryTool implements TroveTool {

    /** Accounts are read per household; more than this is cut off (and says so). */
    static final int MAX_HOUSEHOLDS = 10;

    private final Downstream downstream;

    public FamilyTreasuryLedgerSummaryTool(Downstream downstream) {
        this.downstream = downstream;
    }

    @Override
    public String name() {
        return "family_treasury_ledger_summary";
    }

    @Override
    public String title() {
        return "Family Treasury: ledger summary";
    }

    @Override
    public String description() {
        return "Summarises the household ledger: the balance of every account (pool, pots, income and expense) in each "
                + "household the caller belongs to. Pass householdId for one household. Bookkeeping only; no money moves.";
    }

    @Override
    public Map<String, Object> inputSchema() {
        return Args.object(Map.of("householdId", Args.uuidSchema("Only this household (the caller must be a member)")));
    }

    @Override
    public String requiredPermission() {
        return "products:use";
    }

    @Override
    public ToolOutput call(Map<String, Object> arguments, Caller caller) {
        Args.onlyKnown(arguments, Set.of("householdId"));
        UUID only = Args.optionalUuid(arguments, "householdId");
        List<JsonNode> households = new ArrayList<>();
        if (only != null) {
            households.add(downstream.get(McpProperties.FAMILY_TREASURY, downstream.uri(McpProperties.FAMILY_TREASURY)
                    .path("/v1/households/{id}").buildAndExpand(only).toUri(), caller));
        } else {
            downstream.get(McpProperties.FAMILY_TREASURY, downstream.uri(McpProperties.FAMILY_TREASURY)
                    .path("/v1/households").build().toUri(), caller).forEach(households::add);
        }
        List<Map<String, Object>> out = new ArrayList<>();
        StringBuilder text = new StringBuilder();
        boolean truncated = households.size() > MAX_HOUSEHOLDS;
        for (JsonNode h : households.subList(0, Math.min(households.size(), MAX_HOUSEHOLDS))) {
            String householdCurrency = Args.text(h, "currency");
            List<Map<String, Object>> accounts = new ArrayList<>();
            // The household list carries no accounts; the accounts endpoint also re-checks membership.
            JsonNode list = downstream.get(McpProperties.FAMILY_TREASURY, downstream.uri(McpProperties.FAMILY_TREASURY)
                    .path("/v1/households/{id}/accounts").buildAndExpand(Args.text(h, "id")).toUri(), caller);
            text.append(Args.text(h, "name")).append(" (").append(householdCurrency).append("):\n");
            if (list != null) {
                for (JsonNode a : list) {
                    String currency = Args.text(a, "currency") == null ? householdCurrency : Args.text(a, "currency");
                    long minor = a.path("balanceMinor").asLong();
                    Map<String, Object> acc = new LinkedHashMap<>();
                    acc.put("id", Args.text(a, "id"));
                    acc.put("code", Args.text(a, "code"));
                    acc.put("name", Args.text(a, "name"));
                    acc.put("type", Args.text(a, "type"));
                    acc.put("currency", currency);
                    acc.put("balanceMinor", minor);
                    acc.put("balance", major(minor, currency));
                    accounts.add(acc);
                    text.append("  - ").append(acc.get("name")).append(" [").append(acc.get("type")).append("]: ")
                            .append(acc.get("balance")).append(' ').append(currency).append('\n');
                }
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", Args.text(h, "id"));
            row.put("name", Args.text(h, "name"));
            row.put("currency", householdCurrency);
            row.put("accounts", accounts);
            out.add(row);
        }
        String summary = out.isEmpty() ? "The caller belongs to no household." : text.toString().strip();
        if (truncated) {
            summary += "\n(showing the first " + MAX_HOUSEHOLDS + " of " + households.size() + " households)";
        }
        return new ToolOutput(summary, Map.of("households", out, "count", out.size(), "truncated", truncated));
    }

    /** Minor units as a decimal string in the currency's usual precision (2 when unknown). */
    static String major(long minor, String currency) {
        int digits = 2;
        try {
            if (currency != null) {
                int d = Currency.getInstance(currency).getDefaultFractionDigits();
                digits = d < 0 ? 2 : d;
            }
        } catch (IllegalArgumentException ignored) {
            // unknown code: keep 2
        }
        return BigDecimal.valueOf(minor, digits).toPlainString();
    }
}
