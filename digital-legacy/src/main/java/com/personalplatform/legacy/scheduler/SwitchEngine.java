package com.personalplatform.legacy.scheduler;

import com.personalplatform.legacy.audit.Actor;
import com.personalplatform.legacy.audit.AuditService;
import com.personalplatform.legacy.config.LegacyProperties;
import com.personalplatform.legacy.notify.NotificationKind;
import com.personalplatform.legacy.notify.OutboxRepository;
import com.personalplatform.legacy.protocol.Audience;
import com.personalplatform.legacy.protocol.ChannelType;
import com.personalplatform.legacy.protocol.Contact;
import com.personalplatform.legacy.protocol.EscalationStep;
import com.personalplatform.legacy.protocol.SwitchMachine;
import com.personalplatform.legacy.protocol.SwitchSnapshot;
import com.personalplatform.legacy.protocol.SwitchState;
import com.personalplatform.legacy.protocol.Transition;
import com.personalplatform.legacy.protocol.Urgency;
import com.personalplatform.legacy.trustee.ApprovalRepository;
import com.personalplatform.legacy.trustee.TrusteeRepository;
import com.personalplatform.legacy.trustee.TrusteeRow;
import com.personalplatform.legacy.trustee.TrusteeStatus;
import com.personalplatform.legacy.vault.VaultRepository;
import com.personalplatform.legacy.vault.VaultRow;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Drives vaults through {@link SwitchMachine}: applies due transitions to a LOCKED row, writes their side effects
 * (audit events, escalation-step records, outbox rows) in the same transaction, and keeps the durable timer
 * ({@code next_action_at}) up to date.
 *
 * <p>{@link #tick()} is the scheduler entry point. It claims due vaults one at a time with
 * {@code FOR UPDATE SKIP LOCKED}, so any number of instances (or threads) can run it concurrently: a vault another
 * instance is working on is skipped, and once it commits the vault is no longer due.
 */
@Service
public class SwitchEngine {

    private static final Logger LOG = LoggerFactory.getLogger(SwitchEngine.class);

    /** Escalation step indexes below 0 / above any real step are reserved for protocol notices. */
    public static final int STEP_GRACE_NOTICE = 999;

    public static final int STEP_RELEASE_PENDING = 1000;
    public static final int STEP_RELEASED = 1001;
    public static final int STEP_OWNER_RETURNED = 1002;

    private static final List<ChannelType> ALL_CHANNELS = List.of(ChannelType.PUSH, ChannelType.EMAIL, ChannelType.SMS);
    private static final Duration FAILURE_BACKOFF = Duration.ofMinutes(5);

    private final VaultRepository vaults;
    private final TrusteeRepository trustees;
    private final ApprovalRepository approvals;
    private final OutboxRepository outbox;
    private final AuditService audit;
    private final SwitchMachine machine;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final LegacyProperties props;

    public SwitchEngine(VaultRepository vaults, TrusteeRepository trustees, ApprovalRepository approvals,
            OutboxRepository outbox, AuditService audit, SwitchMachine machine, TransactionTemplate tx, Clock clock,
            LegacyProperties props) {
        this.vaults = vaults;
        this.trustees = trustees;
        this.approvals = approvals;
        this.outbox = outbox;
        this.audit = audit;
        this.machine = machine;
        this.tx = tx;
        this.clock = clock;
        this.props = props;
    }

    /** Processes every vault that is currently due. Returns how many vaults were advanced. */
    public int tick() {
        Set<UUID> failed = new HashSet<>();
        int processed = 0;
        while (processed < props.scheduler().maxPerTick()) {
            Instant now = clock.instant();
            Claimed result = tx.execute(status -> {
                Optional<VaultRow> claimed = vaults.claimDue(now, failed);
                if (claimed.isEmpty()) {
                    return new Claimed(null, false);
                }
                try {
                    advance(claimed.get(), now);
                    return new Claimed(claimed.get().id(), true);
                } catch (RuntimeException e) {
                    status.setRollbackOnly();
                    LOG.error("Advancing vault {} failed: {}", claimed.get().id(), e.toString());
                    return new Claimed(claimed.get().id(), false);
                }
            });
            if (result == null || result.id() == null) {
                break;
            }
            if (result.ok()) {
                processed++;
            } else {
                // do not let one poison vault starve the others or spin the loop
                failed.add(result.id());
                tx.executeWithoutResult(s -> vaults.postpone(result.id(), now.plus(FAILURE_BACKOFF)));
            }
        }
        return processed;
    }

    private record Claimed(UUID id, boolean ok) {}

    /**
     * Applies every transition due at {@code now} to a locked vault row and persists the result. Safe to call from
     * any request that already holds the row lock (e.g. a trustee vote).
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public VaultRow advance(VaultRow row, Instant now) {
        VaultRow cur = row;
        if (cur.policy() != null && cur.armed()) {
            for (int i = 0; i < 500; i++) {
                int approved = cur.state() == SwitchState.RELEASE_PENDING
                        ? approvals.countApprovals(cur.id(), cur.epoch()) : 0;
                Optional<Transition> t = machine.next(cur.snapshot(), cur.policy(), approved, now);
                if (t.isEmpty()) {
                    break;
                }
                cur = applyTransition(cur, t.get(), now);
            }
        }
        persist(cur, now);
        return cur;
    }

    /** Writes a row's protocol state and recomputes the durable timer. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void persist(VaultRow row, Instant now) {
        Instant next = row.armed() && row.policy() != null
                ? machine.nextActionAt(row.snapshot(), row.policy()).orElse(null)
                : null;
        vaults.saveSwitch(row, next, now);
    }

    private VaultRow applyTransition(VaultRow cur, Transition t, Instant now) {
        SwitchSnapshot before = cur.snapshot();
        SwitchSnapshot after = machine.apply(before, t, cur.policy());
        int epoch = cur.epoch() + (t instanceof Transition.EnterGrace ? 1 : 0);
        VaultRow next = cur.with(after, epoch);
        Actor system = Actor.system();
        UUID id = cur.id();
        switch (t) {
            case Transition.Unpause u -> audit.record(id, system, "PAUSE_ENDED",
                    Map.of("nextDueAt", after.nextDueAt().toString()), now);
            case Transition.EnterGrace g -> {
                audit.record(id, system, "STATE_CHANGED", change(before, after, epoch, "check-in missed"), now);
                notifyOwner(next, STEP_GRACE_NOTICE, NotificationKind.CHECK_IN_MISSED, Urgency.NOTICE, ALL_CHANNELS, now);
            }
            case Transition.EnterEscalating e ->
                    audit.record(id, system, "STATE_CHANGED", change(before, after, epoch, "grace elapsed"), now);
            case Transition.ExecuteStep x -> executeStep(next, x, now);
            case Transition.EnterReleasePending r -> {
                audit.record(id, system, "STATE_CHANGED", change(before, after, epoch, "escalation exhausted"), now);
                notifyOwner(next, STEP_RELEASE_PENDING, NotificationKind.RELEASE_PENDING, Urgency.FINAL, ALL_CHANNELS, now);
                notifyTrustees(next, STEP_RELEASE_PENDING, NotificationKind.RELEASE_PENDING, Urgency.FINAL, ALL_CHANNELS,
                        true, now);
            }
            case Transition.QuorumReached q -> audit.record(id, system, "QUORUM_REACHED", Map.of(
                    "required", cur.policy().quorum(), "releaseNotBefore",
                    q.at().plus(cur.policy().coolOff()).toString()), now);
            case Transition.QuorumLost q -> audit.record(id, system, "QUORUM_LOST", Map.of(), now);
            case Transition.Release r -> {
                audit.record(id, system, "RELEASED", Map.of("epoch", epoch), now);
                notifyOwner(next, STEP_RELEASED, NotificationKind.RELEASED, Urgency.FINAL, ALL_CHANNELS, now);
                notifyTrustees(next, STEP_RELEASED, NotificationKind.RELEASED, Urgency.FINAL, ALL_CHANNELS, true, now);
            }
        }
        return next;
    }

    private void executeStep(VaultRow v, Transition.ExecuteStep x, Instant now) {
        EscalationStep step = v.policy().steps().get(x.index());
        // The unique key makes the step idempotent even if two transactions somehow raced past the row lock.
        if (!outbox.recordStep(v.id(), v.epoch(), x.index(), x.at())) {
            LOG.warn("Escalation step {} of vault {} was already recorded; skipping", x.index(), v.id());
            return;
        }
        if (step.audience().includesOwner()) {
            notifyOwner(v, x.index(), NotificationKind.ESCALATION, step.urgency(), step.channels(), now);
        }
        if (step.audience().includesTrustees()) {
            notifyTrustees(v, x.index(), NotificationKind.ESCALATION, step.urgency(), step.channels(), false, now);
        }
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("step", x.index());
        detail.put("urgency", step.urgency().name());
        detail.put("audience", step.audience().name());
        detail.put("slippedSeconds", x.slip().toSeconds());
        audit.record(v.id(), Actor.system(), "ESCALATION_STEP_EXECUTED", detail, now);
    }

    /** Tells trustees the owner is back (used by the owner check-in path). */
    @Transactional(propagation = Propagation.MANDATORY)
    public void notifyOwnerReturned(VaultRow v, Instant now) {
        notifyTrustees(v, STEP_OWNER_RETURNED, NotificationKind.OWNER_RETURNED, Urgency.NOTICE, ALL_CHANNELS, false, now);
    }

    private void notifyOwner(VaultRow v, int step, NotificationKind kind, Urgency urgency, List<ChannelType> prefer,
            Instant now) {
        outbox.enqueue(v.id(), v.epoch(), step, "OWNER", "owner", kind, urgency,
                ordered(v.policy().ownerContacts(), prefer), now);
    }

    private void notifyTrustees(VaultRow v, int step, NotificationKind kind, Urgency urgency,
            List<ChannelType> prefer, boolean onlyShareHolders, Instant now) {
        for (TrusteeRow t : trustees.listForVault(v.id())) {
            boolean eligible = onlyShareHolders ? t.holdsShareFor(v.vaultVersion())
                    : t.active() && t.status() != TrusteeStatus.INVITED;
            if (eligible && !t.contacts().isEmpty()) {
                outbox.enqueue(v.id(), v.epoch(), step, "TRUSTEE", t.id().toString(), kind, urgency,
                        ordered(t.contacts(), prefer), now);
            }
        }
    }

    /** Orders contacts by the step's channel preference; if none match, falls back to all contacts as given. */
    static List<Contact> ordered(List<Contact> contacts, List<ChannelType> prefer) {
        List<Contact> out = new ArrayList<>();
        for (ChannelType c : prefer) {
            contacts.stream().filter(x -> x.channel() == c).forEach(out::add);
        }
        return out.isEmpty() ? contacts : out;
    }

    private static Map<String, Object> change(SwitchSnapshot from, SwitchSnapshot to, int epoch, String reason) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("from", from.state().name());
        m.put("to", to.state().name());
        m.put("epoch", epoch);
        m.put("reason", reason);
        return m;
    }
}
