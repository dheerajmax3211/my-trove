package com.personalplatform.legacy.trustee;

import com.personalplatform.legacy.audit.Actor;
import com.personalplatform.legacy.audit.AuditService;
import com.personalplatform.legacy.config.Json;
import com.personalplatform.legacy.config.LegacyProperties;
import com.personalplatform.legacy.config.Tokens;
import com.personalplatform.legacy.protocol.SwitchState;
import com.personalplatform.legacy.vault.EnvelopeValidator;
import com.personalplatform.legacy.vault.VaultRepository;
import com.personalplatform.legacy.vault.VaultRow;
import com.personalplatform.legacy.web.ConflictException;
import com.personalplatform.legacy.web.NotFoundException;
import com.personalplatform.legacy.web.OwnerDtos.InviteResponse;
import com.personalplatform.legacy.web.OwnerDtos.ShareUpload;
import com.personalplatform.legacy.web.OwnerDtos.TrusteeView;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Owner-side trustee management. Every lookup is scoped to the caller's own vault. */
@Service
public class TrusteeAdminService {

    private final VaultRepository vaults;
    private final TrusteeRepository trustees;
    private final AuditService audit;
    private final EnvelopeValidator envelopes;
    private final Json json;
    private final Clock clock;
    private final LegacyProperties props;

    public TrusteeAdminService(VaultRepository vaults, TrusteeRepository trustees, AuditService audit,
            EnvelopeValidator envelopes, Json json, Clock clock, LegacyProperties props) {
        this.vaults = vaults;
        this.trustees = trustees;
        this.audit = audit;
        this.envelopes = envelopes;
        this.json = json;
        this.clock = clock;
        this.props = props;
    }

    @Transactional
    public InviteResponse invite(String uid, String label) {
        VaultRow vault = lockActive(uid, "Trustees can only be changed while the switch is ACTIVE");
        long active = trustees.listForVault(vault.id()).stream().filter(TrusteeRow::active).count();
        if (active >= props.maxTrustees()) {
            throw new ConflictException("At most " + props.maxTrustees() + " trustees are allowed");
        }
        Instant now = clock.instant();
        String token = Tokens.newToken();
        Instant expires = now.plus(props.inviteTtl());
        UUID id = trustees.invite(vault.id(), label.strip(), Tokens.sha256(token), expires, now);
        audit.record(vault.id(), Actor.owner(uid), "TRUSTEE_INVITED", Map.of("trusteeId", id.toString()));
        return new InviteResponse(id, label.strip(), token, expires);
    }

    @Transactional(readOnly = true)
    public List<TrusteeView> list(String uid) {
        VaultRow vault = vaults.findByOwner(uid).orElseThrow(() -> new NotFoundException("No vault"));
        return trustees.listForVault(vault.id()).stream().map(t -> view(t, vault)).toList();
    }

    @Transactional
    public void revoke(String uid, UUID trusteeId) {
        VaultRow vault = lockActive(uid, "Trustees can only be changed while the switch is ACTIVE");
        TrusteeRow t = trustees.lockInVault(vault.id(), trusteeId)
                .orElseThrow(() -> new NotFoundException("No such trustee"));
        if (!t.active()) {
            return;
        }
        if (vault.armed() && vault.policy() != null) {
            long remaining = trustees.listForVault(vault.id()).stream()
                    .filter(x -> x.active() && !x.id().equals(trusteeId) && x.holdsShareFor(vault.vaultVersion()))
                    .count();
            if (remaining < vault.policy().quorum()) {
                throw new ConflictException(
                        "Revoking this trustee would leave fewer share holders than the quorum; disarm first");
            }
        }
        trustees.revoke(trusteeId, clock.instant());
        audit.record(vault.id(), Actor.owner(uid), "TRUSTEE_REVOKED", Map.of("trusteeId", trusteeId.toString()));
    }

    @Transactional
    public TrusteeView uploadShare(String uid, UUID trusteeId, ShareUpload req) {
        VaultRow vault = lockActive(uid, "Shares can only be uploaded while the switch is ACTIVE");
        TrusteeRow t = trustees.lockInVault(vault.id(), trusteeId)
                .orElseThrow(() -> new NotFoundException("No such trustee"));
        if (t.status() == TrusteeStatus.INVITED || t.status() == TrusteeStatus.REVOKED || t.publicKey() == null) {
            throw new ConflictException("The trustee has not accepted the invite yet (or was revoked)");
        }
        if (req.vaultVersion() != vault.vaultVersion()) {
            throw new ConflictException("Share is for key version " + req.vaultVersion()
                    + " but the vault is at key version " + vault.vaultVersion());
        }
        var share = envelopes.validateSealedShare(req.sealedShare(), t.keyAlgorithm(), json);
        trustees.storeShare(t.id(), share.canonicalJson(), share.sha256(), vault.vaultVersion(), clock.instant());
        audit.record(vault.id(), Actor.owner(uid), "SHARE_UPLOADED", Map.of(
                "trusteeId", t.id().toString(), "sha256", Tokens.hex(share.sha256()),
                "vaultVersion", vault.vaultVersion()));
        return view(trustees.findInVault(vault.id(), t.id()).orElseThrow(), vault);
    }

    private VaultRow lockActive(String uid, String message) {
        VaultRow vault = vaults.lockByOwner(uid).orElseThrow(() -> new NotFoundException("No vault"));
        if (vault.state() != SwitchState.ACTIVE) {
            throw new ConflictException(message + "; check in first");
        }
        return vault;
    }

    private static TrusteeView view(TrusteeRow t, VaultRow vault) {
        return new TrusteeView(t.id(), t.label(), t.status().name(), t.keyAlgorithm(),
                t.publicKey() == null ? null : Base64.getEncoder().encodeToString(t.publicKey()),
                t.keyFingerprint(), t.sealedShare() != null, t.shareVaultVersion(),
                t.holdsShareFor(vault.vaultVersion()), t.status() == TrusteeStatus.CONFIRMED, t.acceptedAt(),
                t.inviteUsedAt() == null ? t.inviteExpiresAt() : null);
    }
}
