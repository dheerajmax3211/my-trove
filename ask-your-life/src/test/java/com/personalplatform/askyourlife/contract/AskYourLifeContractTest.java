package com.personalplatform.askyourlife.contract;

import static com.personalplatform.askyourlife.contract.ContractSchemas.assertMatches;
import static com.personalplatform.askyourlife.support.TestBeans.bearer;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.askyourlife.document.SourceType;
import com.personalplatform.askyourlife.support.AbstractIntegrationTest;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * The real service's responses match {@code contracts/ask-your-life/*.schema.json}, the same files the workspace's
 * demo-mode mock API is checked against. Null fields are omitted by the service, which the contracts encode.
 */
class AskYourLifeContractTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    private String ok(MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request.header("Authorization", bearer("alice")))
                .andExpect(status().is2xxSuccessful()).andReturn().getResponse().getContentAsString();
    }

    @Test
    void documentsAndSearchMatchTheirContracts() throws Exception {
        UUID lease = ingestAndIndex("alice", "Lease", "The tenancy runs for twelve months. Rent of 950 is due on the "
                + "first of each month. The deposit is returned within ten days.", SourceType.FILE);
        String note = """
                {"title":"Boiler","text":"The boiler was serviced in March.","sourceType":"NOTE","externalId":"n-1"}
                """;
        String created = ok(post("/v1/documents").contentType(MediaType.APPLICATION_JSON).content(note));
        assertMatches("ask-your-life/ingest.schema.json", created); // PENDING: no ingestedAt yet
        assertMatches("ask-your-life/ingest.schema.json",
                ok(post("/v1/documents").contentType(MediaType.APPLICATION_JSON).content(note))); // DUPLICATE
        worker.drain(1000);

        assertMatches("ask-your-life/document-list.schema.json", ok(get("/v1/documents")));
        assertMatches("ask-your-life/document.schema.json", ok(get("/v1/documents/" + lease)));

        String hybrid = ok(get("/v1/search?q=when is the rent due&k=5"));
        assertThat(JsonPath.<List<Object>>read(hybrid, "$.hits")).isNotEmpty();
        assertThat(JsonPath.<Object>read(hybrid, "$.answer")).isNotNull();
        assertMatches("ask-your-life/search.schema.json", hybrid);
        assertMatches("ask-your-life/search.schema.json", ok(get("/v1/search?q=deposit&mode=keyword&debug=true")));
        assertMatches("ask-your-life/search.schema.json", ok(get("/v1/search/explain?q=deposit returned")));

        String id = JsonPath.read(created, "$.document.id");
        assertMatches("ask-your-life/ingest.schema.json", ok(put("/v1/documents/" + id)
                .contentType(MediaType.APPLICATION_JSON).content("{\"text\":\"Serviced in April.\"}")));
    }
}
