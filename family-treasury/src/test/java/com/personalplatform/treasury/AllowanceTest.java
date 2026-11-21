package com.personalplatform.treasury;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.personalplatform.treasury.allowance.AllowanceService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MvcResult;

class AllowanceTest extends AbstractIntegrationTest {

    @Autowired AllowanceService allowances;

    private record Kid(Household h, String kid, UUID pot) {}

    private Kid kid(long pool) throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String kid = uid("kid");
        UUID pot = addMember(h, kid, "KID");
        if (pool > 0) {
            deposit(h, pool);
        }
        return new Kid(h, kid, pot);
    }

    private String schedule(Kid k, String frequency, String start, long amount) throws Exception {
        MvcResult r = post("/v1/households/" + k.h().id() + "/allowance-schedules", k.h().owner(), null,
                Map.of("toAccountId", k.pot(), "amountMinor", amount, "frequency", frequency, "startDate", start,
                        "description", "pocket money")).andExpect(status().isCreated()).andReturn();
        return read(r, "$.id");
    }

    private List<String> runs(Kid k, String scheduleId) throws Exception {
        MvcResult r = get("/v1/households/" + k.h().id() + "/allowance-schedules/" + scheduleId + "/runs", k.h().owner())
                .andExpect(status().isOk()).andReturn();
        return JsonPath.read(r.getResponse().getContentAsString(), "$");
    }

    @Test
    void doubleRunPaysOnce() throws Exception {
        Kid k = kid(100_000);
        String sid = schedule(k, "WEEKLY", "2026-03-02", 1_500);

        allowances.runDue();
        allowances.runDue();
        allowances.runDue();

        assertThat(balance(k.h(), k.pot())).isEqualTo(1_500);
        assertThat(balance(k.h(), k.h().pool())).isEqualTo(98_500);
        assertThat(runs(k, sid)).containsExactly("2026-03-02 PAID");
    }

    @Test
    void concurrentRunnersPayEachPeriodExactlyOnce() throws Exception {
        Kid k = kid(100_000);
        String sid = schedule(k, "WEEKLY", "2026-03-02", 1_500);
        allowances.runDue();
        clock.set(Instant.parse("2026-03-09T08:00:00Z"));

        ExecutorService exec = Executors.newFixedThreadPool(6);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<?>> fs = new java.util.ArrayList<>();
        for (int i = 0; i < 6; i++) {
            fs.add(exec.submit(() -> {
                go.await();
                allowances.runDue();
                return null;
            }));
        }
        go.countDown();
        for (Future<?> f : fs) {
            f.get();
        }
        exec.shutdown();

        assertThat(balance(k.h(), k.pot())).isEqualTo(3_000);
        assertThat(runs(k, sid)).containsExactly("2026-03-02 PAID", "2026-03-09 PAID");
        assertThat(dsl.fetchValue("select count(*) from treasury.journal_entries where household_id = ? and kind = 'ALLOWANCE'",
                k.h().id())).isEqualTo(2L);
    }

    @Test
    void missedPeriodsAreSkippedAndOnlyTheLatestDuePeriodIsPaid() throws Exception {
        Kid k = kid(100_000);
        String sid = schedule(k, "WEEKLY", "2026-03-02", 1_500);
        allowances.runDue(); // pays 2026-03-02

        // service "was down" for a month: periods 03-09, 03-16, 03-23, 03-30 and 04-06 became due
        clock.set(Instant.parse("2026-04-08T08:00:00Z"));
        allowances.runDue();

        assertThat(runs(k, sid)).containsExactly("2026-03-02 PAID", "2026-03-09 SKIPPED", "2026-03-16 SKIPPED",
                "2026-03-23 SKIPPED", "2026-03-30 SKIPPED", "2026-04-06 PAID");
        assertThat(balance(k.h(), k.pot())).isEqualTo(3_000); // 2 payments, not 6
        get("/v1/households/" + k.h().id() + "/allowance-schedules", k.h().owner()).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].nextDueOn").value("2026-04-13"));
    }

    @Test
    void notYetDuePeriodsPayNothing() throws Exception {
        Kid k = kid(10_000);
        schedule(k, "WEEKLY", "2026-03-09", 1_500);
        allowances.runDue();
        assertThat(balance(k.h(), k.pot())).isZero();
    }

    @Test
    void unaffordablePeriodIsRecordedAsFailedAndNotRetried() throws Exception {
        Kid k = kid(1_000);
        String sid = schedule(k, "WEEKLY", "2026-03-02", 1_500);
        allowances.runDue();
        assertThat(runs(k, sid)).containsExactly("2026-03-02 FAILED");
        deposit(k.h(), 50_000);
        allowances.runDue(); // same period: not retried
        assertThat(balance(k.h(), k.pot())).isZero();
        clock.set(Instant.parse("2026-03-09T00:00:00Z"));
        allowances.runDue(); // next period is paid normally
        assertThat(balance(k.h(), k.pot())).isEqualTo(1_500);
        assertThat(runs(k, sid)).containsExactly("2026-03-02 FAILED", "2026-03-09 PAID");
    }

    @Test
    void monthlyPeriodsStayAnchoredToTheOriginalDayOfMonth() throws Exception {
        Kid k = kid(100_000);
        clock.set(Instant.parse("2026-01-31T06:00:00Z"));
        String sid = schedule(k, "MONTHLY", "2026-01-31", 2_000);
        allowances.runDue();
        clock.set(Instant.parse("2026-02-28T06:00:00Z")); // Feb has no 31st: period starts on the 28th
        allowances.runDue();
        assertThat(runs(k, sid)).containsExactly("2026-01-31 PAID", "2026-02-28 PAID");
        get("/v1/households/" + k.h().id() + "/allowance-schedules", k.h().owner())
                .andExpect(jsonPath("$[0].nextDueOn").value("2026-03-31"));
        assertThat(balance(k.h(), k.pot())).isEqualTo(4_000);
    }

    @Test
    void deactivatedSchedulesStopPaying() throws Exception {
        Kid k = kid(100_000);
        String sid = schedule(k, "WEEKLY", "2026-03-02", 1_500);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete("/v1/households/" + k.h().id() + "/allowance-schedules/" + sid)
                        .header("Authorization", bearer(k.h().owner())))
                .andExpect(status().isNoContent());
        allowances.runDue();
        assertThat(balance(k.h(), k.pot())).isZero();
    }

    @Test
    void validationAndPermissions() throws Exception {
        Kid k = kid(0);
        // start date in the past
        post("/v1/households/" + k.h().id() + "/allowance-schedules", k.h().owner(), null,
                Map.of("toAccountId", k.pot(), "amountMinor", 100, "frequency", "WEEKLY", "startDate", "2026-03-01",
                        "description", "x")).andExpect(status().isBadRequest());
        // destination must be a member pot, not the pool
        post("/v1/households/" + k.h().id() + "/allowance-schedules", k.h().owner(), null,
                Map.of("toAccountId", k.h().income(), "amountMinor", 100, "frequency", "WEEKLY", "startDate", "2026-03-02",
                        "description", "x")).andExpect(status().isUnprocessableEntity());
        // kids cannot create schedules
        post("/v1/households/" + k.h().id() + "/allowance-schedules", k.kid(), null,
                Map.of("toAccountId", k.pot(), "amountMinor", 100, "frequency", "WEEKLY", "startDate", "2026-03-02",
                        "description", "x")).andExpect(status().isForbidden());
    }
}
