package com.personalplatform.mcp.tools;

import com.personalplatform.mcp.config.McpProperties;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/** Hybrid search (full text + vectors, fused) over the caller's own Ask Your Life documents. */
@Component
public class AskYourLifeSearchTool implements TroveTool {

    static final int MAX_QUERY = 500;
    static final int MAX_K = 10;

    private final Downstream downstream;

    public AskYourLifeSearchTool(Downstream downstream) {
        this.downstream = downstream;
    }

    @Override
    public String name() {
        return "ask_your_life_search";
    }

    @Override
    public String title() {
        return "Ask Your Life: search";
    }

    @Override
    public String description() {
        return "Searches the caller's private notes, receipts and documents and returns the best-matching passages "
                + "with their document titles. Supports quotes, OR and -exclude.";
    }

    @Override
    public Map<String, Object> inputSchema() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("query", Args.stringSchema("The question or keywords", MAX_QUERY));
        props.put("k", Args.integerSchema("How many passages to return", 1, MAX_K, 5));
        return Args.object(props, "query");
    }

    @Override
    public String requiredPermission() {
        return "products:use";
    }

    @Override
    public ToolOutput call(Map<String, Object> arguments, Caller caller) {
        Args.onlyKnown(arguments, Set.of("query", "k"));
        String query = Args.requiredString(arguments, "query", MAX_QUERY);
        int k = Args.integer(arguments, "k", 1, MAX_K, 5);
        JsonNode response = downstream.get(McpProperties.ASK_YOUR_LIFE, downstream.uri(McpProperties.ASK_YOUR_LIFE)
                .path("/v1/search")
                .queryParam("q", "{q}")
                .queryParam("k", k)
                .encode()
                .buildAndExpand(query).toUri(), caller);

        List<Map<String, Object>> passages = new ArrayList<>();
        StringBuilder text = new StringBuilder();
        JsonNode hits = response.get("hits");
        if (hits != null) {
            int rank = 1;
            for (JsonNode hit : hits) {
                Map<String, Object> p = new LinkedHashMap<>();
                p.put("rank", rank);
                p.put("documentId", Args.text(hit, "documentId"));
                p.put("title", Args.text(hit, "title"));
                p.put("sourceType", Args.text(hit, "sourceType"));
                p.put("createdAt", Args.text(hit, "createdAt"));
                p.put("passage", plain(Args.text(hit, "snippet")));
                p.put("score", hit.path("score").asDouble());
                passages.add(p);
                text.append(rank).append(". ").append(p.get("title")).append(": ").append(p.get("passage")).append('\n');
                rank++;
            }
        }
        String summary = passages.isEmpty() ? "No passages matched." : text.toString().strip();
        return new ToolOutput(summary, Map.of("query", query, "passages", passages, "count", passages.size()));
    }

    /** The service's snippet is HTML-escaped with {@code <mark>} around matches; agents get plain text. */
    static String plain(String snippet) {
        if (snippet == null) {
            return null;
        }
        return snippet.replace("<mark>", "").replace("</mark>", "")
                .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'")
                .replace("&#x27;", "'").replace("&amp;", "&");
    }
}
