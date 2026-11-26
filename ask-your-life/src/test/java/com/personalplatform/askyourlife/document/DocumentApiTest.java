package com.personalplatform.askyourlife.document;

import static com.personalplatform.askyourlife.support.TestBeans.bearer;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.askyourlife.config.IngestProperties;
import com.personalplatform.askyourlife.support.AbstractIntegrationTest;
import com.personalplatform.askyourlife.support.TestBeans;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

class DocumentApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired IngestProperties props;

    private static final String ALICE = bearer("alice");
    private static final String BOB = bearer("bob");

    private String postText(String auth, String contentType, String body, String query) throws Exception {
        return mvc.perform(post("/v1/documents" + query).header("Authorization", auth)
                        .contentType(contentType).content(body.getBytes(StandardCharsets.UTF_8)))
                .andExpect(status().isAccepted())
                .andExpect(header().string("Location", containsString("/v1/documents/")))
                .andReturn().getResponse().getContentAsString();
    }

    private String id(String json) {
        return JsonPath.read(json, "$.document.id");
    }

    private String searchJson(String auth, String q, String extra) throws Exception {
        return mvc.perform(get("/v1/search?q=" + q + extra).header("Authorization", auth))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    @Test
    void requiresAuthentication() throws Exception {
        mvc.perform(get("/v1/documents")).andExpect(status().isUnauthorized());
        mvc.perform(get("/v1/search?q=x")).andExpect(status().isUnauthorized());
        mvc.perform(post("/v1/documents").contentType("text/plain").content("x")).andExpect(status().isUnauthorized());
        mvc.perform(get("/actuator/health")).andExpect(status().isNotFound()); // health is served on the private management port only (ObservabilityExposureTest)
    }

    @Test
    void plainTextIngestionIsAsyncAndIdempotent() throws Exception {
        String created = postText(ALICE, "text/plain", "Remember to renew the passport before June.", "?title=Passport&sourceType=NOTE");
        assertThat((String) JsonPath.read(created, "$.outcome")).isEqualTo("CREATED");
        assertThat((String) JsonPath.read(created, "$.document.status")).isEqualTo("PENDING");
        assertThat((String) JsonPath.read(created, "$.document.title")).isEqualTo("Passport");
        String id = id(created);

        mvc.perform(post("/v1/documents?title=Passport").header("Authorization", ALICE)
                        .contentType("text/plain").content("Remember to renew the passport before June."))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.outcome").value("DUPLICATE"))
                .andExpect(jsonPath("$.document.id").value(id));

        mvc.perform(get("/v1/search?q=passport").header("Authorization", ALICE))
                .andExpect(status().isOk()).andExpect(jsonPath("$.hits", hasSize(0))); // not indexed yet

        worker.drain(10);
        mvc.perform(get("/v1/documents/" + id).header("Authorization", ALICE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INDEXED"))
                .andExpect(jsonPath("$.chunkCount").value(1))
                .andExpect(jsonPath("$.contentHash").isString());
        mvc.perform(get("/v1/search?q=passport").header("Authorization", ALICE))
                .andExpect(jsonPath("$.hits", hasSize(1)))
                .andExpect(jsonPath("$.hits[0].title").value("Passport"))
                .andExpect(jsonPath("$.hits[0].snippet").value(containsString("<mark>passport</mark>")))
                .andExpect(jsonPath("$.hits[0].explain").doesNotExist());
    }

    @Test
    void markdownAndHtmlAreExtractedToPlainText() throws Exception {
        postText(ALICE, "text/markdown", "# Trip\n\nBook the **ferry** to [Santorini](https://example.com/ferries) soon.", "");
        postText(ALICE, "text/html", "<html><body><h1>Invoice</h1><p>Plumber visit &amp; repair: 120 EUR</p><script>evil()</script></body></html>", "?sourceType=RECEIPT");
        worker.drain(10);

        mvc.perform(get("/v1/search?q=santorini&mode=keyword").header("Authorization", ALICE))
                .andExpect(jsonPath("$.hits", hasSize(1)))
                .andExpect(jsonPath("$.hits[0].title").value("Trip"))
                .andExpect(jsonPath("$.hits[0].snippet").value(not(containsString("https://"))));
        mvc.perform(get("/v1/search?q=plumber&mode=keyword&sourceType=RECEIPT").header("Authorization", ALICE))
                .andExpect(jsonPath("$.hits", hasSize(1)))
                .andExpect(jsonPath("$.hits[0].sourceType").value("RECEIPT"))
                .andExpect(jsonPath("$.hits[0].snippet").value(not(containsString("evil"))));
        mvc.perform(get("/v1/search?q=evil&mode=keyword").header("Authorization", ALICE))
                .andExpect(jsonPath("$.hits", hasSize(0)));
        mvc.perform(get("/v1/search?q=plumber&mode=keyword&sourceType=NOTE").header("Authorization", ALICE))
                .andExpect(jsonPath("$.hits", hasSize(0)));
    }

    @Test
    void jsonBodyAndMultipartUploads() throws Exception {
        mvc.perform(post("/v1/documents").header("Authorization", ALICE).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Mail\",\"text\":\"Your flight to Oslo departs at nine\",\"sourceType\":\"EMAIL\",\"externalId\":\"msg-1\"}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.document.sourceType").value("EMAIL"))
                .andExpect(jsonPath("$.document.externalId").value("msg-1"));

        MockMultipartFile file = new MockMultipartFile("file", "shopping-list.md", "application/octet-stream",
                "# Shopping\n\n- oat milk\n- **lemons**".getBytes(StandardCharsets.UTF_8));
        mvc.perform(multipart("/v1/documents").file(file).header("Authorization", ALICE))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.document.title").value("shopping-list"))
                .andExpect(jsonPath("$.document.sourceType").value("FILE"))
                .andExpect(jsonPath("$.document.mimeType").value("text/markdown"));
        worker.drain(10);
        mvc.perform(get("/v1/search?q=lemons").header("Authorization", ALICE))
                .andExpect(jsonPath("$.hits[0].title").value("shopping-list"));
        mvc.perform(get("/v1/documents?sourceType=EMAIL").header("Authorization", ALICE))
                .andExpect(jsonPath("$", hasSize(1)));
        mvc.perform(get("/v1/documents").header("Authorization", ALICE)).andExpect(jsonPath("$", hasSize(2)));
    }

    @Test
    void badInputGetsProblemDetails() throws Exception {
        MockMultipartFile pdf = new MockMultipartFile("file", "scan.pdf", "application/pdf", "%PDF-1.7".getBytes());
        mvc.perform(multipart("/v1/documents").file(pdf).header("Authorization", ALICE))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.detail").value(containsString("PDF")));
        mvc.perform(post("/v1/documents").header("Authorization", ALICE).contentType("text/plain").content(""))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/v1/documents").header("Authorization", ALICE).contentType("text/plain").content("   \n  "))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/v1/documents").header("Authorization", ALICE).contentType(MediaType.APPLICATION_JSON).content("{\"text\":\"\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/v1/documents").header("Authorization", ALICE).contentType("application/x-unknown").content("x"))
                .andExpect(status().isUnsupportedMediaType());
        mvc.perform(post("/v1/documents").header("Authorization", ALICE).contentType("text/plain")
                        .content("a".repeat(2 * 1024 * 1024 + 10)))
                .andExpect(status().isContentTooLarge());
        mvc.perform(get("/v1/documents/" + java.util.UUID.randomUUID()).header("Authorization", ALICE))
                .andExpect(status().isNotFound());
        mvc.perform(get("/v1/documents/not-a-uuid").header("Authorization", ALICE)).andExpect(status().isBadRequest());
        assertThat(count("documents")).isZero();
    }

    @Test
    void updateAndDeleteViaApi() throws Exception {
        String id = id(postText(ALICE, "text/plain", "first draft about tangerines", "?title=Draft"));
        worker.drain(10);

        mvc.perform(put("/v1/documents/" + id).header("Authorization", ALICE).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"second draft about rhubarb\"}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.outcome").value("UPDATED"))
                .andExpect(jsonPath("$.document.status").value("PENDING"))
                .andExpect(jsonPath("$.document.title").value("Draft"));
        worker.drain(10);
        mvc.perform(get("/v1/search?q=tangerines&mode=keyword").header("Authorization", ALICE)).andExpect(jsonPath("$.hits", hasSize(0)));
        mvc.perform(get("/v1/search?q=rhubarb&mode=keyword").header("Authorization", ALICE)).andExpect(jsonPath("$.hits", hasSize(1)));

        mvc.perform(delete("/v1/documents/" + id).header("Authorization", ALICE)).andExpect(status().isNoContent());
        mvc.perform(get("/v1/documents/" + id).header("Authorization", ALICE)).andExpect(status().isNotFound());
        mvc.perform(delete("/v1/documents/" + id).header("Authorization", ALICE)).andExpect(status().isNotFound());
        mvc.perform(get("/v1/search?q=rhubarb&mode=keyword").header("Authorization", ALICE)).andExpect(jsonPath("$.hits", hasSize(0)));
        assertThat(count("chunks")).isZero();
    }

    @Test
    void userBCannotSeeChangeOrDeleteUserAData() throws Exception {
        String id = id(postText(ALICE, "text/plain", "alice private tax return with the word zebra", "?title=Taxes"));
        worker.drain(10);
        postText(BOB, "text/plain", "bob unrelated note about gardening", "?title=Garden");
        worker.drain(10);

        // search
        for (String mode : new String[] {"hybrid", "keyword", "semantic"}) {
            String json = searchJson(BOB, "zebra", "&mode=" + mode + "&debug=true");
            assertThat(JsonPath.<java.util.List<Object>>read(json, "$.hits[*].title")).doesNotContain("Taxes");
        }
        assertThat(JsonPath.<java.util.List<Object>>read(searchJson(BOB, "zebra", "&mode=keyword"), "$.hits")).isEmpty();
        // read / list
        mvc.perform(get("/v1/documents/" + id).header("Authorization", BOB)).andExpect(status().isNotFound());
        mvc.perform(get("/v1/documents").header("Authorization", BOB))
                .andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].title").value("Garden"));
        // modify / delete
        mvc.perform(put("/v1/documents/" + id).header("Authorization", BOB).contentType(MediaType.APPLICATION_JSON)
                .content("{\"text\":\"defaced\"}")).andExpect(status().isNotFound());
        mvc.perform(delete("/v1/documents/" + id).header("Authorization", BOB)).andExpect(status().isNotFound());
        // same external id / same text under B does not touch A's document
        postText(BOB, "text/plain", "alice private tax return with the word zebra", "?title=Copy");
        worker.drain(10);

        // A's data is intact
        mvc.perform(get("/v1/documents/" + id).header("Authorization", ALICE))
                .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Taxes")).andExpect(jsonPath("$.status").value("INDEXED"));
        mvc.perform(get("/v1/search?q=zebra&mode=keyword").header("Authorization", ALICE))
                .andExpect(jsonPath("$.hits", hasSize(1))).andExpect(jsonPath("$.hits[0].documentId").value(id));
    }

    @Test
    void aDocumentThatCannotBeIndexedSaysWhyInTheLibraryAndRetriesAreVisible() throws Exception {
        String fine = id(postText(ALICE, "text/plain", "this one indexes fine", "?title=Fine"));
        worker.drain(1000);
        TestBeans.EMBEDDER.failure.set(new IllegalStateException("model is down"));
        String stuck = id(postText(ALICE, "text/plain", "this will never embed", "?title=Stuck"));

        worker.drain(1000); // attempt 1 fails: the document stays PENDING, with the reason; the retry is not due yet
        mvc.perform(get("/v1/documents/" + stuck).header("Authorization", ALICE))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.indexingError").value(containsString("model is down")));

        for (int attempt = 2; attempt <= props.maxAttempts(); attempt++) {
            TestBeans.CLOCK.advance(props.maxBackoff());
            worker.drain(1000);
        }
        // dead-lettered: the library shows FAILED and the reason, in the single document and in the list
        mvc.perform(get("/v1/documents/" + stuck).header("Authorization", ALICE))
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.indexingError").value(containsString("model is down")));
        mvc.perform(get("/v1/documents").header("Authorization", ALICE))
                .andExpect(jsonPath("$[?(@.title == 'Stuck')].indexingError").value(hasSize(1)))
                .andExpect(jsonPath("$[?(@.title == 'Stuck')].status").value(hasSize(1)));
        // a document that is indexed has no error at all
        mvc.perform(get("/v1/documents/" + fine).header("Authorization", ALICE))
                .andExpect(jsonPath("$.status").value("INDEXED"))
                .andExpect(jsonPath("$.indexingError").doesNotExist());
    }

    @Test
    void searchParametersAreValidatedAndDebugShowsRanks() throws Exception {
        postText(ALICE, "text/plain", "quarterly budget review notes", "?title=Budget");
        worker.drain(10);

        mvc.perform(get("/v1/search").header("Authorization", ALICE)).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/search?q=").header("Authorization", ALICE)).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/search?q=a&k=0").header("Authorization", ALICE)).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/search?q=a&k=51").header("Authorization", ALICE)).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/search?q=a&mode=magic").header("Authorization", ALICE)).andExpect(status().isBadRequest());
        mvc.perform(get("/v1/search?q=a&from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z").header("Authorization", ALICE))
                .andExpect(status().isBadRequest());

        String dbg = searchJson(ALICE, "budget", "&debug=true");
        assertThat(((Number) JsonPath.read(dbg, "$.hits[0].score")).doubleValue())
                .isCloseTo(2.0 / 61, org.assertj.core.data.Offset.offset(1e-9));
        mvc.perform(get("/v1/search?q=budget&debug=true").header("Authorization", ALICE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("HYBRID"))
                .andExpect(jsonPath("$.debug.rrfK").value(60))
                .andExpect(jsonPath("$.hits[0].explain.ftsRank").value(1))
                .andExpect(jsonPath("$.hits[0].explain.semanticRank").value(1))
                .andExpect(jsonPath("$.hits[0].explain.ftsScore").isNumber())
                .andExpect(jsonPath("$.hits[0].explain.semanticSimilarity").isNumber());
        mvc.perform(get("/v1/search/explain?q=budget&mode=KEYWORD").header("Authorization", ALICE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("KEYWORD"))
                .andExpect(jsonPath("$.hits[0].explain.ftsRank").value(1))
                .andExpect(jsonPath("$.hits[0].explain.semanticRank").doesNotExist());
        mvc.perform(get("/v1/search?q=budget&from=2026-01-01T00:00:00Z&to=2026-12-31T00:00:00Z").header("Authorization", ALICE))
                .andExpect(jsonPath("$.hits", hasSize(1)));
        mvc.perform(get("/v1/search?q=budget&to=2026-01-01T00:00:00Z").header("Authorization", ALICE))
                .andExpect(jsonPath("$.hits", hasSize(0)));
    }
}
