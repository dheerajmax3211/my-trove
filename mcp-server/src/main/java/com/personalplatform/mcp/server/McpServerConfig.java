package com.personalplatform.mcp.server;

import com.personalplatform.mcp.audit.ToolCallAudit;
import com.personalplatform.mcp.config.SecurityConfig;
import com.personalplatform.mcp.tools.Caller;
import io.modelcontextprotocol.common.McpTransportContext;
import io.modelcontextprotocol.json.McpJsonDefaults;
import io.modelcontextprotocol.json.McpJsonMapper;
import io.modelcontextprotocol.server.McpServer;
import io.modelcontextprotocol.server.McpStatelessSyncServer;
import io.modelcontextprotocol.server.transport.HttpServletStatelessServerTransport;
import io.modelcontextprotocol.spec.McpSchema;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.ServletRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * The MCP endpoint: the official Java SDK's stateless Streamable HTTP transport (JSON-RPC over POST, a JSON
 * response per request, no session state, so any replica can answer) mounted as a servlet at {@code /mcp}, behind
 * the Spring Security chain. The caller is read from the verified token on the request thread and handed to the
 * tools through the MCP transport context.
 */
@Configuration(proxyBeanMethods = false)
public class McpServerConfig {

    public static final String SERVER_NAME = "my-trove";

    @Bean
    McpJsonMapper mcpJsonMapper() {
        return McpJsonDefaults.getMapper();
    }

    @Bean
    HttpServletStatelessServerTransport mcpTransport(McpJsonMapper json) {
        return HttpServletStatelessServerTransport.builder()
                .jsonMapper(json)
                .messageEndpoint(SecurityConfig.MCP_PATH)
                .contextExtractor(request -> {
                    Authentication auth = SecurityContextHolder.getContext().getAuthentication();
                    if (auth instanceof JwtAuthenticationToken jwt) {
                        return McpTransportContext.create(Map.of(ToolRegistry.CALLER, Caller.from(jwt.getToken())));
                    }
                    return McpTransportContext.EMPTY;
                })
                .build();
    }

    @Bean
    ServletRegistrationBean<HttpServletStatelessServerTransport> mcpServlet(HttpServletStatelessServerTransport transport) {
        ServletRegistrationBean<HttpServletStatelessServerTransport> bean =
                new ServletRegistrationBean<>(transport, SecurityConfig.MCP_PATH);
        bean.setName("mcp");
        bean.setLoadOnStartup(1);
        return bean;
    }

    @Bean(destroyMethod = "close")
    McpStatelessSyncServer mcpServer(HttpServletStatelessServerTransport transport, ToolRegistry tools,
            ToolCallAudit audit, McpJsonMapper json, @Value("${app.mcp.version:0.0.1}") String version) {
        return McpServer.sync(new AuditingTransport(transport, audit, json, tools::names))
                .serverInfo(SERVER_NAME, version)
                .instructions("Read-only tools over the signed-in person's My-Trove data: Waiting On follow-ups, "
                        + "Ask Your Life search, Home Pulse appliance status and Family Treasury balances. Each tool "
                        + "needs the matching product permission on the caller's token; every call is audited.")
                .capabilities(McpSchema.ServerCapabilities.builder().tools(false).build())
                .jsonMapper(json)
                .validateToolInputs(true)
                .immediateExecution(true)
                .tools(tools.specifications())
                .build();
    }
}
