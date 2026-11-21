package com.personalplatform.legacy.trustee;

import com.personalplatform.legacy.audit.Actor;
import com.personalplatform.legacy.audit.AuditService;
import com.personalplatform.legacy.config.Json;
import com.personalplatform.legacy.config.Tokens;
import com.personalplatform.legacy.protocol.SwitchState;
import com.personalplatform.legacy.scheduler.SwitchEngine;
import com.personalplatform.legacy.vault.EnvelopeValidator;
import com.personalplatform.legacy.vault.PolicyValidator;
import com.personalplatform.legacy.vault.VaultRepository;
import com.personalplatform.legacy.vault.VaultRow;
import com.personalplatform.legacy.web.ConflictException;
import com.personalplatform.legacy.web.InvalidRequestException;
import com.personalplatform.legacy.web.NotFoundException;
import com.personalplatform.legacy.web.TrusteeDtos.*;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;

/**
 * What a trustee (a person who may have no platform account) can do. Identity comes from the trustee token resolved
 * by {@link TrusteeTokenFilter}; the vault id is taken from that identity, never from the request.
 */
@Service
public class TrusteePortalService {

    private final VaultRepository vaults;
    private final TrusteeRepository trustees;
    private final ApprovalRepository approvals;
    private final SwitchEngine engine;
    private final AuditService audit;
    private final EnvelopeValidator envelopes;
    private final Json json;
    private final Clock clock;

    public TrusteePortalService(VaultRepository vaults, TrusteeRepository trustees, ApprovalRepository approvals,
            SwitchEngine engine, AuditService audit, EnvelopeValidator envelopes, Json json, Clock clock) {
        this.vaults = vaults;
        this.trustees = trustees;
        this.approvals = approvals;
        this.engine = engine;
        this.audit = audit;
        this.envelopes = envelopes;
        this.json = json;
        this.clock = clock;
    }

    /** Burns the single-use invite token, registers the trustee's key and contacts, issues the access token. */
    @Transactional
    public AcceptResponse accept(AcceptRequest req) {
        Instant now = clock.instant();
        TrusteeRow t = trustees.findByInviteHash(Tokens.sha256(req.inviteToken().strip()))
                .filter(x -> x.status() == TrusteeStatus.INVITED && x.inviteUsedAt() == null
                        && now.isBefore(x.inviteExpiresAt()))
                .orElseThrow(() -> new NotFoundException("The invite is invalid, expired or already used"));
        List<String> problems = new ArrayList<>();
        PolicyValidator.validateContacts("contacts", req.contacts(), problems);
        if (!problems.isEmpty()) {
            throw new InvalidRequestException(problems);
        }
        var key = envelopes.validatePublicKey(req.keyAlgorithm(), req.publicKey());
        String accessToken = Tokens.newToken();
        trustees.accept(t.id(), Tokens.sha256(accessToken), key.algorithm(), key.spki(), key.fingerprint(),
                req.contacts(), now);
        audit.record(t.vaultId(), Actor.trustee(t.id()), "TRUSTEE_ACCEPTED", Map.of(
                "trusteeId", t.id().toString(), "keyAlgorithm", key.algorithm(), "fingerprint", key.fingerprint()));
        return new AcceptResponse(t.id(), t.vaultId(), accessToken, key.fingerprint(), "Trustee");
    }

    /** Used by the authentication filter: resolves a token digest to a principal, only for non-revoked trustees. */
    @Transactional(readOnly = true)
    public Optional<TrusteePrincipal> authenticate(String token) {
        return trustees.findByAccessHash(Tokens.sha256(token))
                .filter(TrusteeRow::active)
                .map(t -> new TrusteePrincipal(t.id(), t.vaultId()));
    }

    @Transactional(readOnly = true)
    public TrusteeStateView me(TrusteePrincipal p) {
        TrusteeRow t = self(p);
        VaultRow v = vaults.findById(p.vaultId()).orElseThrow(() -> new NotFoundException("No vault"));
        String decision = approvals.decisionOf(v.id(), v.epoch(), t.id()).orElse(null);
        return new TrusteeStateView(t.id(), v.id(), t.label(), t.status().name(), phase(v),
                v.policy() == null ? 0 : v.policy().quorum(), t.sealedShare() != null,
                t.shareSha256() == null ? null : Tokens.hex(t.shareSha256()), t.shareVaultVersion(),
                v.state() == SwitchState.RELEASE_PENDING || v.state() == SwitchState.RELEASED ? decision : null,
                t.keyFingerprint());
    }

    /** Acknowledges that the share exists, proving the trustee is reachable and was told what to expect. */
    @Transactional
    public TrusteeStateView confirm(TrusteePrincipal p, String digest) {
        TrusteeRow t = trustees.lockInVault(p.vaultId(), p.trusteeId()).filter(TrusteeRow::active)
                .orElseThrow(() -> new NotFoundException("No such trustee"));
        if (t.sealedShare() == null || t.shareSha256() == null) {
            throw new ConflictException("No share has been uploaded for you yet");
        }
        if (!Tokens.hex(t.shareSha256()).equalsIgnoreCase(digest.strip())) {
            throw new ConflictException("Digest does not match the share currently stored for you");
        }
        trustees.confirmShare(t.id(), clock.instant());
        audit.record(t.vaultId(), Actor.trustee(t.id()), "SHARE_CONFIRMED", Map.of("trusteeId", t.id().toString()));
        return me(p);
    }

    /**
     * Casts or changes a vote. Only while RELEASE_PENDING, only for a trustee that actually holds a share of the
     * current key, and only once per incident (a repeat replaces the earlier vote, it never adds to the count).
     */
    @Transactional
    public VoteResponse vote(TrusteePrincipal p, Decision decision) {
        VaultRow v = vaults.lockById(p.vaultId()).orElseThrow(() -> new NotFoundException("No vault"));
        TrusteeRow t = trustees.findInVault(v.id(), p.trusteeId()).filter(TrusteeRow::active)
                .orElseThrow(() -> new NotFoundException("No such trustee"));
        if (v.state() != SwitchState.RELEASE_PENDING) {
            throw new ConflictException("Voting is not open");
        }
        if (!t.holdsShareFor(v.vaultVersion())) {
            throw new ConflictException("You do not hold a share of the current key, so you cannot vote");
        }
        Instant now = clock.instant();
        Optional<String> previous = approvals.decisionOf(v.id(), v.epoch(), t.id());
        approvals.vote(v.id(), v.epoch(), t.id(), decision.name(), now);
        boolean changed = previous.map(x -> !x.equals(decision.name())).orElse(true);
        audit.record(v.id(), Actor.trustee(t.id()), "APPROVAL_CAST", Map.of(
                "trusteeId", t.id().toString(), "decision", decision.name(), "repeat", previous.isPresent() && !changed,
                "epoch", v.epoch()));
        VaultRow after = engine.advance(v, now);
        return new VoteResponse(decision.name(), phase(after), changed);
    }

    @Transactional
    public ShareView fetchShare(TrusteePrincipal p) {
        VaultRow v = released(p);
        TrusteeRow t = trustees.findInVault(v.id(), p.trusteeId()).filter(TrusteeRow::active)
                .orElseThrow(() -> new NotFoundException("No such trustee"));
        if (t.sealedShare() == null || !t.holdsShareFor(v.vaultVersion())) {
            throw new NotFoundException("No share is stored for you");
        }
        audit.record(v.id(), Actor.trustee(t.id()), "SHARE_FETCHED", Map.of("trusteeId", t.id().toString()));
        return new ShareView(v.id(), t.id(), v.vaultVersion(),
                json.read(t.sealedShare(), new TypeReference<Map<String, Object>>() {}));
    }

    @Transactional
    public CiphertextView fetchCiphertext(TrusteePrincipal p) {
        VaultRow v = released(p);
        TrusteeRow t = self(p);
        var blob = vaults.fetchCiphertext(v.id()).orElseThrow();
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("trusteeId", t.id().toString());
        detail.put("bytes", blob.ciphertext().length);
        audit.record(v.id(), Actor.trustee(t.id()), "CIPHERTEXT_FETCHED", detail);
        return new CiphertextView(v.id(), blob.vaultVersion(), Base64.getEncoder().encodeToString(blob.ciphertext()),
                json.read(blob.metadataJson(), new TypeReference<Map<String, Object>>() {}),
                Tokens.hex(blob.sha256()));
    }

    private VaultRow released(TrusteePrincipal p) {
        VaultRow v = vaults.findById(p.vaultId()).orElseThrow(() -> new NotFoundException("No vault"));
        if (v.state() != SwitchState.RELEASED) {
            throw new ConflictException("The vault has not been released");
        }
        return v;
    }

    private TrusteeRow self(TrusteePrincipal p) {
        return trustees.findInVault(p.vaultId(), p.trusteeId()).filter(TrusteeRow::active)
                .orElseThrow(() -> new NotFoundException("No such trustee"));
    }

    private static String phase(VaultRow v) {
        return switch (v.state()) {
            case RELEASED -> "RELEASED";
            case RELEASE_PENDING -> "VOTING";
            default -> "WAITING";
        };
    }
}
