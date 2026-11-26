package com.personalplatform.mcp.tools;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.mcp.audit.ToolCallAudit;
import com.personalplatform.mcp.config.McpProperties;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * The tools' own argument checks (they hold even if the SDK's schema validation were switched off) and small pure
 * helpers. No Docker, no Spring. The downstream points at a closed port: any call that got that far would fail
 * differently, so a ToolInputException proves nothing was sent.
 */
class ToolInputTest {

    static final Downstream NOWHERE = new Downstream(new McpProperties(Map.of(
            "waiting-on", "http://127.0.0.1:1", "ask-your-life", "http://127.0.0.1:1",
            "home-pulse", "http://127.0.0.1:1", "family-treasury", "http://127.0.0.1:1"), null));
    static final Caller ANN = new Caller("ann", Caller.Type.USER, Set.of("products:use"), "t");

    @Test
    void followupsCheckTheLimit() {
        var tool = new WaitingOnFollowupsTool(NOWHERE);
        assertThatThrownBy(() -> tool.call(Map.of("limit", 21), ANN)).isInstanceOf(ToolInputException.class);
        assertThatThrownBy(() -> tool.call(Map.of("limit", 0), ANN)).isInstanceOf(ToolInputException.class);
        assertThatThrownBy(() -> tool.call(Map.of("limit", 2.5), ANN)).isInstanceOf(ToolInputException.class);
        assertThatThrownBy(() -> tool.call(Map.of("limit", "5"), ANN)).isInstanceOf(ToolInputException.class);
        assertThatThrownBy(() -> tool.call(Map.of("owner", "bob"), ANN)).isInstanceOf(ToolInputException.class)
                .hasMessageContaining("owner");
    }

    @Test
    void searchNeedsABoundedQuery() {
        var tool = new AskYourLifeSearchTool(NOWHERE);
        assertThatThrownBy(() -> tool.call(Map.of(), ANN)).isInstanceOf(ToolInputException.class);
        assertThatThrownBy(() -> tool.call(Map.of("query", "   "), ANN)).isInstanceOf(ToolInputException.class);
        assertThatThrownBy(() -> tool.call(Map.of("query", "x".repeat(501)), ANN)).isInstanceOf(ToolInputException.class);
        assertThatThrownBy(() -> tool.call(Map.of("query", "x", "k", 11), ANN)).isInstanceOf(ToolInputException.class);
    }

    @Test
    void idsMustBeUuids() {
        assertThatThrownBy(() -> new HomePulseApplianceStatusTool(NOWHERE).call(Map.of("applianceId", "../alerts"), ANN))
                .isInstanceOf(ToolInputException.class);
        assertThatThrownBy(() -> new FamilyTreasuryLedgerSummaryTool(NOWHERE).call(Map.of("householdId", 42), ANN))
                .isInstanceOf(ToolInputException.class);
        // UUID.fromString accepts short forms like "1-1-1-1-1"; the tools do not.
        assertThatThrownBy(() -> new FamilyTreasuryLedgerSummaryTool(NOWHERE).call(Map.of("householdId", "1-1-1-1-1"), ANN))
                .isInstanceOf(ToolInputException.class);
    }

    @Test
    void snippetsBecomePlainText() {
        assertThat(AskYourLifeSearchTool.plain("a <mark>b</mark> &lt;c&gt; &amp;amp; &quot;d&quot; &#39;e&#39;"))
                .isEqualTo("a b <c> &amp; \"d\" 'e'");
        assertThat(AskYourLifeSearchTool.plain(null)).isNull();
    }

    @Test
    void minorUnitsFollowTheCurrency() {
        assertThat(FamilyTreasuryLedgerSummaryTool.major(-1050, "EUR")).isEqualTo("-10.50");
        assertThat(FamilyTreasuryLedgerSummaryTool.major(1050, "JPY")).isEqualTo("1050");
        assertThat(FamilyTreasuryLedgerSummaryTool.major(1050, "KWD")).isEqualTo("1.050");
        assertThat(FamilyTreasuryLedgerSummaryTool.major(1050, "XYZ")).isEqualTo("10.50");
    }

    @Test
    void theArgumentsHashIgnoresKeyOrderButNotValues() {
        Map<String, Object> a = new LinkedHashMap<>();
        a.put("query", "tax");
        a.put("k", 3);
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("k", 3);
        b.put("query", "tax");
        assertThat(ToolCallAudit.argumentsHash(a)).isEqualTo(ToolCallAudit.argumentsHash(b)).hasSize(64);
        assertThat(ToolCallAudit.argumentsHash(Map.of("query", "tax!"))).isNotEqualTo(ToolCallAudit.argumentsHash(a));
        assertThat(ToolCallAudit.argumentsHash(null)).isEqualTo(ToolCallAudit.argumentsHash(Map.of()));
    }

    @Test
    void theCallerNeverPrintsItsToken() {
        assertThat(new Caller("ann", Caller.Type.USER, Set.of(), "secret-token").toString()).doesNotContain("secret");
    }
}
