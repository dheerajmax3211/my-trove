package com.personalplatform.treasury;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

class IdempotencyTest extends AbstractIntegrationTest {

    @Test
    void replayReturnsTheOriginalResultAndCreatesExactlyOneEntry() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        deposit(h, 10_000);
        long before = entryCount(h.id());
        String k = key();

        MvcResult first = post("/v1/households/" + h.id() + "/spends", h.owner(), k, spendBody(null, 2_500))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("POSTED")).andReturn();
        MvcResult replay = post("/v1/households/" + h.id() + "/spends", h.owner(), k, spendBody(null, 2_500))
                .andExpect(status().isCreated()).andExpect(header().string("Idempotent-Replayed", "true")).andReturn();

        assertThat(read(replay, "$.entry.id")).isEqualTo(read(first, "$.entry.id"));
        assertThat(replay.getResponse().getContentAsString()).isEqualTo(first.getResponse().getContentAsString());
        assertThat(entryCount(h.id())).isEqualTo(before + 1);
        assertThat(balance(h, h.pool())).isEqualTo(7_500);
    }

    @Test
    void sameKeyWithDifferentBodyIsRejectedWith409() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        deposit(h, 10_000);
        String k = key();
        post("/v1/households/" + h.id() + "/spends", h.owner(), k, spendBody(null, 1_000)).andExpect(status().isCreated());
        long before = entryCount(h.id());

        post("/v1/households/" + h.id() + "/spends", h.owner(), k, spendBody(null, 1_001))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
        // reusing the key for a different operation type is also a conflict
        post("/v1/households/" + h.id() + "/deposits", h.owner(), k, Map.of("amountMinor", 1_000, "description", "x"))
                .andExpect(status().isConflict());

        assertThat(entryCount(h.id())).isEqualTo(before);
        assertThat(balance(h, h.pool())).isEqualTo(9_000);
    }

    @Test
    void idempotencyKeyIsRequiredAndValidated() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        post("/v1/households/" + h.id() + "/deposits", h.owner(), null, Map.of("amountMinor", 1, "description", "x"))
                .andExpect(status().isBadRequest());
        post("/v1/households/" + h.id() + "/deposits", h.owner(), "bad key with spaces!", Map.of("amountMinor", 1, "description", "x"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_IDEMPOTENCY_KEY"));
    }

    @Test
    void aFailedOperationLeavesNoRecordSoTheKeyCanBeRetried() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String k = key();
        post("/v1/households/" + h.id() + "/spends", h.owner(), k, spendBody(null, 5_000))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INSUFFICIENT_FUNDS"));
        deposit(h, 6_000);
        post("/v1/households/" + h.id() + "/spends", h.owner(), k, spendBody(null, 5_000)).andExpect(status().isCreated());
        assertThat(balance(h, h.pool())).isEqualTo(1_000);
    }

    @Test
    void keysAreScopedPerHousehold() throws Exception {
        Household a = newHousehold(uid("owner"), null);
        Household b = newHousehold(uid("owner"), null);
        String k = key();
        post("/v1/households/" + a.id() + "/deposits", a.owner(), k, Map.of("amountMinor", 100, "description", "x")).andExpect(status().isCreated());
        post("/v1/households/" + b.id() + "/deposits", b.owner(), k, Map.of("amountMinor", 100, "description", "x")).andExpect(status().isCreated());
        assertThat(balance(a, a.pool())).isEqualTo(100);
        assertThat(balance(b, b.pool())).isEqualTo(100);
    }

    @Test
    void creatingAHouseholdIsIdempotentToo() throws Exception {
        String owner = uid("owner");
        String k = key();
        Map<String, Object> body = Map.of("name", "Home", "currency", "EUR");
        MvcResult first = post("/v1/households", owner, k, body).andExpect(status().isCreated()).andReturn();
        MvcResult second = post("/v1/households", owner, k, body).andExpect(status().isCreated()).andReturn();
        assertThat(read(second, "$.id")).isEqualTo(read(first, "$.id"));
        MvcResult mine = get("/v1/households", owner).andExpect(status().isOk()).andReturn();
        assertThat(mine.getResponse().getContentAsString()).containsOnlyOnce(read(first, "$.id"));
        post("/v1/households", owner, k, Map.of("name", "Other", "currency", "EUR")).andExpect(status().isConflict());
    }

    @Test
    void concurrentDuplicateRequestsCreateExactlyOneEntry() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        deposit(h, 10_000);
        long before = entryCount(h.id());
        String k = key();
        int threads = 12;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<MvcResult>> futures = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            Callable<MvcResult> call = () -> {
                go.await();
                return post("/v1/households/" + h.id() + "/spends", h.owner(), k, spendBody(null, 1_000)).andReturn();
            };
            futures.add(pool.submit(call));
        }
        go.countDown();
        List<String> entryIds = new ArrayList<>();
        int replays = 0;
        for (Future<MvcResult> f : futures) {
            MvcResult r = f.get();
            assertThat(r.getResponse().getStatus()).isEqualTo(201);
            entryIds.add(read(r, "$.entry.id"));
            if ("true".equals(r.getResponse().getHeader("Idempotent-Replayed"))) {
                replays++;
            }
        }
        pool.shutdown();
        assertThat(entryIds).containsOnly(entryIds.get(0));
        assertThat(replays).isEqualTo(threads - 1);
        assertThat(entryCount(h.id())).isEqualTo(before + 1);
        assertThat(balance(h, h.pool())).isEqualTo(9_000);
        UUID.fromString(entryIds.get(0));
    }
}
