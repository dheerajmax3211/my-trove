package com.personalplatform.mcp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

import com.personalplatform.mcp.audit.ToolCallAudit;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** No audit row, no data: when the audit write fails, the tool's answer is withheld. */
class AuditFailureTest extends McpTestBase {

    @MockitoBean ToolCallAudit audit;

    @Test
    void aFailedAuditWriteWithholdsTheResult() throws Exception {
        doThrow(new IllegalStateException("database down")).when(audit).record(any());
        service("family-treasury").reply("/v1/households", 200, "[{\"id\":\"0190f0a0-0000-7000-8000-000000000301\","
                + "\"name\":\"Secret household\",\"currency\":\"EUR\"}]")
                .reply("/v1/households/0190f0a0-0000-7000-8000-000000000301/accounts", 200, "[]");

        HttpResponse<String> r = post(member("ann"), "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\","
                + "\"params\":{\"name\":\"family_treasury_ledger_summary\",\"arguments\":{}}}");

        assertThat(r.body()).doesNotContain("Secret household");
        assertThat(r.statusCode() != 200 || r.body().contains("\"error\"")).as(r.statusCode() + " " + r.body()).isTrue();
    }
}
