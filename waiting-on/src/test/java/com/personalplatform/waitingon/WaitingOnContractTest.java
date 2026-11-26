package com.personalplatform.waitingon;

import static com.personalplatform.waitingon.StubJwtConfig.bearer;
import static com.personalplatform.waitingon.contract.ContractSchemas.assertMatches;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * The real service's responses match {@code contracts/waiting-on/*.schema.json}, the same files the workspace's
 * demo-mode mock API is checked against. Same context as {@link WaitingOnApiTest} (real Postgres, Temporal test
 * server), so {@code followUp} and {@code nextStep} are filled from a running workflow.
 */
@Import({TestcontainersConfiguration.class, StubJwtConfig.class, TestTemporalConfig.class})
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "app.inbound.secret=test-secret")
class WaitingOnContractTest {

    @Autowired MockMvc mvc;

    private String body(String uid, MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request.header("Authorization", bearer(uid)))
                .andExpect(status().is2xxSuccessful()).andReturn().getResponse().getContentAsString();
    }

    private String create(String uid, String title, String extra) throws Exception {
        return body(uid, post("/v1/items").contentType(MediaType.APPLICATION_JSON).content("""
                {"title":"%s","counterparty":"Shop Ltd","category":"REFUND","expectedBy":"%s"%s}
                """.formatted(title, LocalDate.now().plusDays(3), extra)));
    }

    @Test
    void itemsListItemTimelineAndDraftMatchTheirContracts() throws Exception {
        String uid = "uid-contract-" + System.nanoTime();
        String full = create(uid, "Headphones refund",
                ",\"counterpartyEmail\":\"help@shop.example\",\"amount\":120.50,\"currency\":\"GBP\"");
        assertMatches("waiting-on/item.schema.json", full);
        create(uid, "Bare claim", ""); // nullable email, amount and currency
        String id = JsonPath.read(full, "$.id");

        assertMatches("waiting-on/item-list.schema.json", body(uid, get("/v1/items")));
        assertMatches("waiting-on/item.schema.json", body(uid, get("/v1/items/" + id)));
        assertMatches("waiting-on/timeline.schema.json", body(uid, get("/v1/items/" + id + "/timeline")));
        assertMatches("waiting-on/draft.schema.json", body(uid, get("/v1/items/" + id + "/draft?tone=ESCALATION")));
        assertMatches("waiting-on/item.schema.json", body(uid,
                post("/v1/items/" + id + "/snooze").contentType(MediaType.APPLICATION_JSON).content("{\"days\":3}")));

        String resolved = body(uid, post("/v1/items/" + id + "/resolve").contentType(MediaType.APPLICATION_JSON)
                .content("{\"outcome\":\"Paid\"}"));
        assertMatches("waiting-on/item.schema.json", resolved); // closed: followUp and nextStep are null
        assertMatches("waiting-on/item-list.schema.json",
                body(uid, get("/v1/items?status=RESOLVED&status=EXPIRED&status=CANCELLED")));
    }
}
