package com.personalplatform.treasury;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.treasury.ops.OpsDtos.ReverseRequest;
import com.personalplatform.treasury.ops.OpsDtos.SpendRequest;
import com.personalplatform.treasury.ops.OpsDtos.TransferRequest;
import com.personalplatform.treasury.ops.TreasuryOps;
import com.personalplatform.treasury.report.ReconciliationService;
import com.personalplatform.treasury.web.ApiException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class ConcurrencyTest extends AbstractIntegrationTest {

    @Autowired TreasuryOps ops;
    @Autowired ReconciliationService reconciliation;

    @Test
    void parallelSpendsAgainstABalanceThatCoversOnlyKSucceedExactlyK() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        deposit(h, 10_000); // covers exactly 10 spends of 1_000
        int n = 30;
        long before = entryCount(h.id());

        ExecutorService exec = Executors.newFixedThreadPool(16);
        CountDownLatch go = new CountDownLatch(1);
        AtomicInteger ok = new AtomicInteger();
        AtomicInteger insufficient = new AtomicInteger();
        List<Future<?>> futures = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            futures.add(exec.submit(() -> {
                go.await();
                try {
                    ops.spend(h.owner(), h.id(), key(), new SpendRequest(null, null, 1_000, "parallel"));
                    ok.incrementAndGet();
                } catch (ApiException e) {
                    assertThat(e.code()).isEqualTo("INSUFFICIENT_FUNDS");
                    insufficient.incrementAndGet();
                }
                return null;
            }));
        }
        go.countDown();
        for (Future<?> f : futures) {
            f.get();
        }
        exec.shutdown();

        assertThat(ok.get()).isEqualTo(10);
        assertThat(insufficient.get()).isEqualTo(n - 10);
        assertThat(balance(h, h.pool())).isZero();
        assertThat(ledgerSum(h.pool())).isZero();
        assertThat(entryCount(h.id())).isEqualTo(before + 10);
        assertThat(reconciliation.reconcile(h.id()).consistent()).isTrue();
    }

    @Test
    void opposingTransfersBetweenTheSameAccountsDoNotDeadlockAndStayConsistent() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String kidA = uid("a");
        String kidB = uid("b");
        UUID potA = addMember(h, kidA, "MEMBER");
        UUID potB = addMember(h, kidB, "MEMBER");
        deposit(h, 100_000);
        ops.transfer(h.owner(), h.id(), key(), new TransferRequest(h.pool(), potA, 50_000, "fund a"));
        ops.transfer(h.owner(), h.id(), key(), new TransferRequest(h.pool(), potB, 50_000, "fund b"));

        ExecutorService exec = Executors.newFixedThreadPool(16);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<?>> futures = new ArrayList<>();
        for (int i = 0; i < 40; i++) {
            boolean forward = i % 2 == 0;
            futures.add(exec.submit(() -> {
                go.await();
                ops.transfer(forward ? kidA : kidB, h.id(), key(),
                        new TransferRequest(forward ? potA : potB, forward ? potB : potA, 100, "ping-pong"));
                return null;
            }));
        }
        go.countDown();
        for (Future<?> f : futures) {
            f.get(); // any deadlock or serialization failure would surface here
        }
        exec.shutdown();

        assertThat(balance(h, potA) + balance(h, potB)).isEqualTo(100_000);
        assertThat(balance(h, potA)).isEqualTo(50_000); // 20 forward, 20 back
        assertThat(reconciliation.reconcile(h.id()).consistent()).isTrue();
    }

    @Test
    void concurrentReversalsOfOneEntryProduceExactlyOneReversal() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        UUID deposit = deposit(h, 5_000);
        ExecutorService exec = Executors.newFixedThreadPool(8);
        CountDownLatch go = new CountDownLatch(1);
        AtomicInteger ok = new AtomicInteger();
        AtomicInteger already = new AtomicInteger();
        List<Future<?>> futures = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            futures.add(exec.submit(() -> {
                go.await();
                try {
                    ops.reverse(h.owner(), h.id(), key(), deposit, new ReverseRequest("race"));
                    ok.incrementAndGet();
                } catch (ApiException e) {
                    assertThat(e.code()).isEqualTo("ALREADY_REVERSED");
                    already.incrementAndGet();
                }
                return null;
            }));
        }
        go.countDown();
        for (Future<?> f : futures) {
            f.get();
        }
        exec.shutdown();
        assertThat(ok.get()).isEqualTo(1);
        assertThat(already.get()).isEqualTo(7);
        assertThat(balance(h, h.pool())).isZero();
        assertThat(reconciliation.reconcile(h.id()).consistent()).isTrue();
    }
}
