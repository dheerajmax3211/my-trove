package com.personalplatform.legacy.vault;

import com.personalplatform.legacy.audit.Actor;
import com.personalplatform.legacy.audit.AuditService;
import com.personalplatform.legacy.config.Json;
import com.personalplatform.legacy.config.LegacyProperties;
import com.personalplatform.legacy.config.Tokens;
import com.personalplatform.legacy.notify.OutboxRepository;
import com.personalplatform.legacy.protocol.ProtocolException;
import com.personalplatform.legacy.protocol.SwitchMachine;
import com.personalplatform.legacy.protocol.SwitchPolicy;
import com.personalplatform.legacy.protocol.SwitchSnapshot;
import com.personalplatform.legacy.protocol.SwitchState;
import com.personalplatform.legacy.scheduler.SwitchEngine;
import com.personalplatform.legacy.trustee.ApprovalRepository;
import com.personalplatform.legacy.trustee.TrusteeRepository;
import com.personalplatform.legacy.trustee.TrusteeRow;
import com.personalplatform.legacy.web.ConflictException;
import com.personalplatform.legacy.web.NotFoundException;
import com.personalplatform.legacy.web.OwnerDtos;
import com.personalplatform.legacy.web.OwnerDtos.*;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;

/**
 * Owner-facing use cases. Every method starts from the caller's uid; there is no way to name another owner's vault.
 * Mutations take the vault row lock first, which serialises them with the scheduler and with trustee votes.
 */
@Service
public class VaultService {

    private final VaultRepository vaults;
    private final TrusteeRepository trustees;
    private final ApprovalRepository approvals;
    private final OutboxRepository outbox;
    private final SwitchEngine engine;
    private final SwitchMachine machine;
    private final AuditService audit;
    private final EnvelopeValidator envelopes;
    private final PolicyValidator policyValidator;
    private final Json json;
    private final Clock clock;
    private final LegacyProperties props;

    public VaultService(VaultRepository vaults, TrusteeRepository trustees, ApprovalRepository approvals,
            OutboxRepository outbox, SwitchEngine engine, SwitchMachine machine, AuditService audit,
            EnvelopeValidator envelopes, PolicyValidator policyValidator, Json json, Clock clock,
            LegacyProperties props) {
        this.vaults = vaults;
        this.trustees = trustees;
        this.approvals = approvals;
        this.outbox = outbox;
        this.engine = engine;
        this.machine = machine;
        this.audit = audit;
        this.envelopes = envelopes;
        this.policyValidator = policyValidator;
        this.json = json;
        this.clock = clock;
        this.props = props;
    }

    // ---- vault content -----------------------------------------------------------------------------------

    @Transactional
    public VaultSummary create(String uid, CreateVaultRequest req) {
        var v = envelopes.validateVault(req.ciphertext(), req.metadata(), json);
        if (vaults.findByOwner(uid).isPresent()) {
            throw new ConflictException("You already have a vault; update it instead");
        }
        VaultRow row;
        try {
            row = vaults.insert(uid, v.ciphertext(), v.sha256(), v.metadataJson(), clock.instant());
        } catch (DuplicateKeyException e) {
            throw new ConflictException("You already have a vault; update it instead");
        }
        audit.record(row.id(), Actor.owner(uid), "VAULT_CREATED",
                Map.of("bytes", v.ciphertext().length, "sha256", Tokens.hex(v.sha256())));
        return summary(row);
    }

    @Transactional
    public VaultSummary update(String uid, UpdateVaultRequest req) {
        VaultRow row = lock(uid);
        requireActive(row, "Vault content can only be changed while the switch is ACTIVE; check in first");
        var v = envelopes.validateVault(req.ciphertext(), req.metadata(), json);
        Instant now = clock.instant();
        vaults.updateContent(row.id(), v.ciphertext(), v.sha256(), v.metadataJson(), req.keyRotated(), now);
        if (req.keyRotated()) {
            trustees.clearSharesForRotation(row.id());
        }
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("bytes", v.ciphertext().length);
        detail.put("sha256", Tokens.hex(v.sha256()));
        detail.put("keyRotated", req.keyRotated());
        if (req.keyRotated() && row.armed()) {
            detail.put("disarmed", true);
        }
        audit.record(row.id(), Actor.owner(uid), req.keyRotated() ? "VAULT_ROTATED" : "VAULT_UPDATED", detail);
        return summary(vaults.findById(row.id()).orElseThrow());
    }

    @Transactional(readOnly = true)
    public VaultSummary get(String uid) {
        return summary(vaults.findByOwner(uid).orElseThrow(() -> new NotFoundException("No vault")));
    }

    /** The owner may always download their own ciphertext (to decrypt it client-side). */
    @Transactional(readOnly = true)
    public CiphertextView ciphertext(String uid) {
        VaultRow row = vaults.findByOwner(uid).orElseThrow(() -> new NotFoundException("No vault"));
        var blob = vaults.fetchCiphertext(row.id()).orElseThrow();
        return new CiphertextView(Base64.getEncoder().encodeToString(blob.ciphertext()),
                json.read(blob.metadataJson(), new TypeReference<Map<String, Object>>() {}), blob.vaultVersion(),
                Tokens.hex(blob.sha256()));
    }

    // ---- policy / arming ---------------------------------------------------------------------------------

    @Transactional
    public StateView setPolicy(String uid, SwitchPolicy policy) {
        VaultRow row = lock(uid);
        requireActive(row, "The policy can only be changed while the switch is ACTIVE; check in first");
        policyValidator.validate(policy);
        List<TrusteeRow> team = trustees.listForVault(row.id());
        long active = team.stream().filter(TrusteeRow::active).count();
        if (active > 0 && policy.quorum() > active) {
            throw new ConflictException("quorum " + policy.quorum() + " exceeds the number of trustees (" + active + ")");
        }
        Instant now = clock.instant();
        vaults.savePolicy(row.id(), policy, now);
        VaultRow next = row.withPolicy(policy);
        if (row.armed()) {
            // a changed policy restarts the interval, exactly like a check-in
            next = next.with(machine.checkIn(next.snapshot(), policy, now), next.epoch()).withLastCheckin(now);
        }
        engine.persist(next, now);
        audit.record(row.id(), Actor.owner(uid), "POLICY_SET", Map.of(
                "intervalSeconds", policy.checkInIntervalSeconds(), "graceSeconds", policy.graceSeconds(),
                "coolOffSeconds", policy.coolOffSeconds(), "quorum", policy.quorum(),
                "steps", policy.steps().size(), "armed", row.armed()));
        return state(next);
    }

    @Transactional
    public StateView arm(String uid) {
        VaultRow row = lock(uid);
        if (row.armed()) {
            return state(row);
        }
        requireActive(row, "Only an ACTIVE switch can be armed");
        Readiness readiness = readiness(row, trustees.listForVault(row.id()));
        if (!readiness.armable()) {
            throw new ConflictException("Not ready to arm: " + String.join("; ", readiness.problems()));
        }
        Instant now = clock.instant();
        VaultRow next = row.withArmed(true, now).with(SwitchSnapshot.active(now, row.policy()), row.epoch());
        engine.persist(next, now);
        audit.record(row.id(), Actor.owner(uid), "ARMED", Map.of("nextDueAt", next.nextDueAt().toString()));
        return state(next);
    }

    @Transactional
    public StateView disarm(String uid) {
        VaultRow row = lock(uid);
        if (row.state().terminal()) {
            throw new ProtocolException("The vault has already been released");
        }
        Instant now = clock.instant();
        SwitchState previous = row.state();
        VaultRow next = row.withArmed(false, row.lastCheckinAt());
        if (row.policy() != null) {
            next = next.with(SwitchSnapshot.active(now, row.policy()), row.epoch());
        }
        engine.persist(next, now);
        audit.record(row.id(), Actor.owner(uid), "DISARMED", Map.of("previousState", previous.name()));
        return state(next);
    }

    // ---- check-in / pause --------------------------------------------------------------------------------

    /**
     * One-tap check-in. Valid from every state except RELEASED: it returns the switch to ACTIVE, restarts the
     * interval, and (by leaving the incident) makes every approval of it irrelevant. It deliberately does NOT first
     * advance overdue timers, so a check-in that wins the row lock against the scheduler always wins.
     */
    @Transactional
    public StateView checkIn(String uid) {
        VaultRow row = lock(uid);
        Instant now = clock.instant();
        if (row.state().terminal()) {
            throw new ProtocolException("The vault has already been released; a check-in can no longer cancel it");
        }
        SwitchState previous = row.state();
        int invalidated = previous == SwitchState.RELEASE_PENDING ? approvals.countApprovals(row.id(), row.epoch()) : 0;
        VaultRow next = row.withLastCheckin(now);
        if (row.policy() != null) {
            if (row.pausedUntil() != null) {
                next = next.with(machine.resume(next.snapshot(), row.policy(), now, row.ledger()).ledger());
                audit.record(row.id(), Actor.owner(uid), "PAUSE_ENDED", Map.of("reason", "check-in"));
            }
            next = next.with(machine.checkIn(next.snapshot(), row.policy(), now), row.epoch());
        }
        if (previous == SwitchState.RELEASE_PENDING) {
            engine.notifyOwnerReturned(next, now);
        }
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("previousState", previous.name());
        detail.put("approvalsInvalidated", invalidated);
        audit.record(row.id(), Actor.owner(uid), "CHECK_IN", detail);
        if (previous != SwitchState.ACTIVE) {
            audit.record(row.id(), Actor.owner(uid), "STATE_CHANGED", Map.of(
                    "from", previous.name(), "to", "ACTIVE", "epoch", row.epoch(), "reason", "owner check-in"));
        }
        engine.persist(next, now);
        return state(next);
    }

    @Transactional
    public StateView pause(String uid, long durationSeconds) {
        VaultRow row = lock(uid);
        if (!row.armed() || row.policy() == null) {
            throw new ProtocolException("The switch is not armed; there is nothing to pause");
        }
        Instant now = clock.instant();
        var limits = props.limits();
        var result = machine.pause(row.snapshot(), row.policy(), now, Duration.ofSeconds(durationSeconds),
                row.ledger(), limits.maxPause(), limits.yearlyPauseBudget());
        VaultRow next = row.with(result.snapshot(), row.epoch()).with(result.ledger());
        engine.persist(next, now);
        audit.record(row.id(), Actor.owner(uid), "PAUSED", Map.of(
                "until", result.snapshot().pausedUntil().toString(), "durationSeconds", durationSeconds));
        return state(next);
    }

    @Transactional
    public StateView resume(String uid) {
        VaultRow row = lock(uid);
        if (row.policy() == null) {
            throw new ProtocolException("The switch is not paused");
        }
        Instant now = clock.instant();
        var result = machine.resume(row.snapshot(), row.policy(), now, row.ledger());
        VaultRow next = row.with(result.snapshot(), row.epoch()).with(result.ledger());
        engine.persist(next, now);
        audit.record(row.id(), Actor.owner(uid), "PAUSE_ENDED", Map.of("reason", "resumed by owner"));
        return state(next);
    }

    // ---- views -------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public StateView state(String uid) {
        return state(vaults.findByOwner(uid).orElseThrow(() -> new NotFoundException("No vault")));
    }

    @Transactional(readOnly = true)
    public List<TimelineEntry> timeline(String uid, int limit) {
        VaultRow row = vaults.findByOwner(uid).orElseThrow(() -> new NotFoundException("No vault"));
        return audit.timeline(row.id(), Math.max(1, Math.min(limit, 500))).stream()
                .map(e -> new TimelineEntry(e.seq(), e.at(), e.actorKind(), e.eventType(), e.detail()))
                .toList();
    }

    @Transactional(readOnly = true)
    public ChainView verifyAudit(String uid) {
        VaultRow row = vaults.findByOwner(uid).orElseThrow(() -> new NotFoundException("No vault"));
        var c = audit.verify(row.id());
        return new ChainView(c.intact(), c.length(), c.headHash(), c.firstBadSeq());
    }

    StateView state(VaultRow row) {
        List<TrusteeRow> team = trustees.listForVault(row.id());
        long active = team.stream().filter(TrusteeRow::active).count();
        long holders = team.stream().filter(t -> t.active() && t.holdsShareFor(row.vaultVersion())).count();
        Map<java.util.UUID, String> decisions = approvals.decisions(row.id(), row.epoch());
        boolean votingEra = row.state() == SwitchState.RELEASE_PENDING || row.state() == SwitchState.RELEASED;
        int approved = 0;
        int declined = 0;
        if (votingEra) {
            for (TrusteeRow t : team) {
                String d = decisions.get(t.id());
                if (t.active() && "APPROVE".equals(d)) {
                    approved++;
                } else if (t.active() && "DECLINE".equals(d)) {
                    declined++;
                }
            }
        }
        SwitchPolicy p = row.policy();
        Quorum quorum = new Quorum(p == null ? 0 : p.quorum(), approved, declined, (int) active, (int) holders,
                row.quorumReachedAt(),
                row.quorumReachedAt() == null || p == null ? null : row.quorumReachedAt().plus(p.coolOff()));
        return new StateView(row.state().name(), row.armed(), row.epoch(), row.lastCheckinAt(), row.nextDueAt(),
                row.pausedUntil(), row.stateEnteredAt(), nextAction(row), row.releasedAt(),
                new Escalation(row.stepsExecuted(), p == null ? 0 : p.steps().size()), quorum,
                new Pause(row.ledger().at(clock.instant()).usedSeconds(),
                        props.limits().yearlyPauseBudget().toSeconds(),
                        p == null ? 0 : Math.min(p.maxPauseSeconds(), props.limits().maxPause().toSeconds())),
                readiness(row, team), p);
    }

    /** The durable timer as it is (or will be) stored, derived so freshly mutated rows show the right value. */
    private Instant nextAction(VaultRow row) {
        return row.armed() && row.policy() != null
                ? machine.nextActionAt(row.snapshot(), row.policy()).orElse(null)
                : null;
    }

    static Readiness readiness(VaultRow row, List<TrusteeRow> team) {
        List<String> problems = new ArrayList<>();
        if (row.policy() == null) {
            problems.add("no check-in policy set");
        } else {
            long holders = team.stream().filter(t -> t.active() && t.holdsShareFor(row.vaultVersion())).count();
            if (holders < row.policy().quorum()) {
                problems.add("only " + holders + " trustee(s) hold a share of the current key but the quorum is "
                        + row.policy().quorum());
            }
        }
        return new Readiness(problems.isEmpty(), problems);
    }

    VaultSummary summary(VaultRow row) {
        return new VaultSummary(row.id(), row.state().name(), row.armed(), row.vaultVersion(), row.contentRevision(),
                row.ciphertextBytes(), Tokens.hex(row.ciphertextSha256()),
                json.read(row.metadataJson(), new TypeReference<Map<String, Object>>() {}), row.policy() != null,
                row.createdAt(), row.updatedAt());
    }

    private VaultRow lock(String uid) {
        return vaults.lockByOwner(uid).orElseThrow(() -> new NotFoundException("No vault"));
    }

    private static void requireActive(VaultRow row, String message) {
        if (row.state() != SwitchState.ACTIVE) {
            throw new ConflictException(message);
        }
    }
}
