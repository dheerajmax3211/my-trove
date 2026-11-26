package com.personalplatform.askyourlife.search;

import static com.personalplatform.askyourlife.support.TestBeans.bearer;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.personalplatform.askyourlife.document.SourceType;
import com.personalplatform.askyourlife.support.AbstractIntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

/** GET /v1/search carries an extractive, cited answer above the hits. */
class SearchAnswerApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void searchReturnsACitedAnswerQuotedFromTheTopHit() throws Exception {
        UUID lease = ingestAndIndex("alice", "Lease", "The tenancy runs for twelve months. Rent of 950 is due on the "
                + "first of each month. Pets need written consent.", SourceType.FILE);
        ingestAndIndex("alice", "Gym", "Gym membership renews in May.", SourceType.NOTE);

        mvc.perform(get("/v1/search?q=rent due date").header("Authorization", bearer("alice")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answer.text").value("Rent of 950 is due on the first of each month."))
                .andExpect(jsonPath("$.answer.sentences", hasSize(1)))
                .andExpect(jsonPath("$.answer.sentences[0].documentId").value(lease.toString()))
                .andExpect(jsonPath("$.answer.sentences[0].title").value("Lease"))
                .andExpect(jsonPath("$.answer.sentences[0].chunkOrdinal").value(0))
                .andExpect(jsonPath("$.answer.sentences[0].chunkId").isString())
                .andExpect(jsonPath("$.answer.score").isNumber())
                .andExpect(jsonPath("$.hits[0].title").value("Lease"));
    }

    @Test
    void answerCanBeSwitchedOffAndIsAbsentWithoutHitsAndNeverQuotesAnotherUser() throws Exception {
        ingestAndIndex("alice", "Lease", "Rent of 950 is due on the first of each month.", SourceType.FILE);
        mvc.perform(get("/v1/search?q=rent due&answer=false").header("Authorization", bearer("alice")))
                .andExpect(jsonPath("$.hits", hasSize(1)))
                .andExpect(jsonPath("$.answer").doesNotExist());
        mvc.perform(get("/v1/search?q=rent due").header("Authorization", bearer("bob")))
                .andExpect(jsonPath("$.hits", hasSize(0)))
                .andExpect(jsonPath("$.answer").doesNotExist());
    }
}
