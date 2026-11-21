package com.personalplatform.treasury.web;

import com.personalplatform.treasury.household.Dtos.AccountView;
import com.personalplatform.treasury.household.Dtos.AddMemberRequest;
import com.personalplatform.treasury.household.Dtos.ChangeRoleRequest;
import com.personalplatform.treasury.household.Dtos.CreateAccountRequest;
import com.personalplatform.treasury.household.Dtos.CreateHouseholdRequest;
import com.personalplatform.treasury.household.Dtos.HouseholdView;
import com.personalplatform.treasury.household.Dtos.MemberView;
import com.personalplatform.treasury.household.Dtos.UpdateSettingsRequest;
import com.personalplatform.treasury.household.HouseholdService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/households")
public class HouseholdController {

    private final HouseholdService households;

    public HouseholdController(HouseholdService households) {
        this.households = households;
    }

    /** Creates a household with the caller as OWNER and the default pool / income / expense / pot accounts. */
    @PostMapping
    public ResponseEntity<HouseholdView> create(@AuthenticationPrincipal Jwt jwt,
                                                @RequestHeader("Idempotency-Key") String key,
                                                @Valid @RequestBody CreateHouseholdRequest req) {
        return Responses.of(households.create(jwt.getSubject(), jwt.getClaimAsString("name"), key, req));
    }

    @GetMapping
    public List<HouseholdView> mine(@AuthenticationPrincipal Jwt jwt) {
        return households.listMine(jwt.getSubject());
    }

    @GetMapping("/{householdId}")
    public HouseholdView get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId) {
        return households.view(householdId, jwt.getSubject());
    }

    @PutMapping("/{householdId}/settings")
    public HouseholdView settings(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId,
                                  @Valid @RequestBody UpdateSettingsRequest req) {
        return households.updateSettings(householdId, jwt.getSubject(), req);
    }

    @GetMapping("/{householdId}/members")
    public List<MemberView> members(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId) {
        households.requireMember(householdId, jwt.getSubject());
        return households.members(householdId);
    }

    @PostMapping("/{householdId}/members")
    @ResponseStatus(HttpStatus.CREATED)
    public MemberView addMember(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId,
                                @Valid @RequestBody AddMemberRequest req) {
        return households.addMember(householdId, jwt.getSubject(), req);
    }

    @PutMapping("/{householdId}/members/{uid}/role")
    public MemberView changeRole(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId, @PathVariable String uid,
                                 @Valid @RequestBody ChangeRoleRequest req) {
        return households.changeRole(householdId, jwt.getSubject(), uid, req.role());
    }

    @GetMapping("/{householdId}/accounts")
    public List<AccountView> accounts(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId) {
        return households.accounts(householdId, households.requireMember(householdId, jwt.getSubject()));
    }

    @PostMapping("/{householdId}/accounts")
    @ResponseStatus(HttpStatus.CREATED)
    public AccountView createAccount(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId,
                                     @Valid @RequestBody CreateAccountRequest req) {
        return households.createAccount(householdId, jwt.getSubject(), req);
    }

    @GetMapping("/{householdId}/accounts/{accountId}")
    public AccountView account(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID householdId, @PathVariable UUID accountId) {
        return households.accountView(householdId, accountId, households.requireMember(householdId, jwt.getSubject()));
    }
}
