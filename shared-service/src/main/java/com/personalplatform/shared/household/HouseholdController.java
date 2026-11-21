package com.personalplatform.shared.household;

import com.personalplatform.shared.household.HouseholdService.HouseholdDetail;
import com.personalplatform.shared.household.HouseholdService.HouseholdView;
import com.personalplatform.shared.household.HouseholdService.InviteCreated;
import com.personalplatform.shared.household.HouseholdService.InviteView;
import com.personalplatform.shared.household.HouseholdService.MemberView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
public class HouseholdController {

    public record CreateHouseholdRequest(@NotBlank @Size(max = 200) String name) {}

    public record CreateInviteRequest(Role role, @Min(1) @Max(720) Integer ttlHours) {}

    public record AcceptInviteRequest(@NotBlank @Size(max = 200) String code) {}

    public record ChangeRoleRequest(@NotNull Role role) {}

    private final HouseholdService households;
    private final HouseholdAccess access;

    public HouseholdController(HouseholdService households, HouseholdAccess access) {
        this.households = households;
        this.access = access;
    }

    @PostMapping("/households")
    @ResponseStatus(HttpStatus.CREATED)
    public HouseholdView create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateHouseholdRequest req) {
        return households.create(jwt.getSubject(), req.name());
    }

    @GetMapping("/households")
    public List<HouseholdView> mine(@AuthenticationPrincipal Jwt jwt) {
        return households.listMine(jwt.getSubject());
    }

    @GetMapping("/households/{id}")
    public HouseholdDetail get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return households.get(jwt.getSubject(), id);
    }

    @DeleteMapping("/households/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        households.delete(jwt.getSubject(), id);
    }

    /** The membership check other services can call with the caller's own token (404 when not a member). */
    @GetMapping("/households/{id}/membership")
    public Membership membership(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return access.requireMember(jwt.getSubject(), id);
    }

    @PostMapping("/households/{id}/invites")
    @ResponseStatus(HttpStatus.CREATED)
    public InviteCreated createInvite(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @Valid @RequestBody(required = false) CreateInviteRequest req) {
        Duration ttl = req == null || req.ttlHours() == null ? null : Duration.ofHours(req.ttlHours());
        return households.createInvite(jwt.getSubject(), id, req == null ? null : req.role(), ttl);
    }

    @GetMapping("/households/{id}/invites")
    public List<InviteView> invites(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return households.pendingInvites(jwt.getSubject(), id);
    }

    @DeleteMapping("/households/{id}/invites/{inviteId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeInvite(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID inviteId) {
        households.revokeInvite(jwt.getSubject(), id, inviteId);
    }

    @PostMapping("/invites/accept")
    public HouseholdView accept(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AcceptInviteRequest req) {
        return households.acceptInvite(jwt.getSubject(), req.code());
    }

    @PostMapping("/households/{id}/leave")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void leave(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        households.leave(jwt.getSubject(), id);
    }

    @DeleteMapping("/households/{id}/members/{uid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeMember(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable String uid) {
        households.removeMember(jwt.getSubject(), id, uid);
    }

    @PutMapping("/households/{id}/members/{uid}/role")
    public MemberView changeRole(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable String uid,
            @Valid @RequestBody ChangeRoleRequest req) {
        return households.changeRole(jwt.getSubject(), id, uid, req.role());
    }
}
