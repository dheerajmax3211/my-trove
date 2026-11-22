package com.personalplatform.waitingon.item;

import com.personalplatform.waitingon.escalation.EscalationPlan;
import com.personalplatform.waitingon.escalation.Letter;
import com.personalplatform.waitingon.escalation.Tone;
import com.personalplatform.waitingon.inbound.InboundEmailService;
import com.personalplatform.waitingon.item.ItemService.ItemDetail;
import com.personalplatform.waitingon.item.ItemService.NewItem;
import com.personalplatform.waitingon.workflow.FollowUpState;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1/items")
@Validated
public class ItemController {

    public record PlanRequest(@NotNull @Min(1) Integer nudgeAfterDays, @NotNull @Min(1) Integer escalateAfterDays,
            @NotNull @Min(0) Integer finalNoticeAfterDays, @NotNull @Min(1) Integer expireAfterDays) {
    }

    public record CreateItemRequest(
            @NotBlank @Size(max = 200) String title,
            @NotBlank @Size(max = 200) String counterparty,
            @Email @Size(max = 320) String counterpartyEmail,
            @NotNull ItemCategory category,
            @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal amount,
            @Pattern(regexp = "[A-Z]{3}", message = "must be an ISO 4217 code such as USD") String currency,
            @NotNull LocalDate expectedBy,
            @Valid PlanRequest plan) {
    }

    public record ResolveRequest(@Size(max = 1000) String outcome) {
    }

    /** A reply the owner received elsewhere (letter, phone note, forwarded mail) and pastes in. */
    public record ReplyRequest(@Size(max = 320) String from, @Size(max = 500) String subject,
            @NotBlank @Size(max = 20_000) String text) {
    }

    public record SnoozeRequest(@Min(1) @Max(90) int days) {
    }

    public record PlanView(int nudgeAfterDays, int escalateAfterDays, int finalNoticeAfterDays, int expireAfterDays) {
        static PlanView of(EscalationPlan p) {
            return new PlanView(p.nudgeAfterDays(), p.escalateAfterDays(), p.finalNoticeAfterDays(),
                    p.expireAfterDays());
        }
    }

    public record FollowUpView(String stage, String nextAction, Instant nextActionAt, int snoozedDays) {
        static FollowUpView of(FollowUpState s) {
            return new FollowUpView(s.stage().name(), s.nextAction().name(),
                    s.nextActionAtEpochMillis() == null ? null : Instant.ofEpochMilli(s.nextActionAtEpochMillis()),
                    s.snoozedDays());
        }
    }

    public record ItemResponse(UUID id, String title, String counterparty, String counterpartyEmail,
            ItemCategory category, BigDecimal amount, String currency, LocalDate expectedBy, ItemStatus status,
            String outcome, String replyAddress, PlanView plan, OffsetDateTime createdAt, OffsetDateTime updatedAt,
            OffsetDateTime closedAt, FollowUpView followUp) {
    }

    public record TimelineResponse(UUID id, EventType type, String summary, String detail, OffsetDateTime occurredAt) {
    }

    public record DraftResponse(Tone tone, String subject, String body, String note) {
    }

    private static final String DRAFT_NOTE = "Template wording only; it cites well known consumer-rights instruments "
            + "as examples and is not legal advice. Check what applies in your jurisdiction before sending.";

    private final ItemService service;
    private final ItemLetters letters;
    private final InboundEmailService replies;

    public ItemController(ItemService service, ItemLetters letters, InboundEmailService replies) {
        this.service = service;
        this.letters = letters;
        this.replies = replies;
    }

    @PostMapping
    public ResponseEntity<ItemResponse> create(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateItemRequest r) {
        EscalationPlan plan = r.plan() == null ? null : new EscalationPlan(r.plan().nudgeAfterDays(),
                r.plan().escalateAfterDays(), r.plan().finalNoticeAfterDays(), r.plan().expireAfterDays());
        WaitingItem item = service.create(jwt.getSubject(), new NewItem(r.title(), r.counterparty(),
                r.counterpartyEmail(), r.category(), r.amount(), r.currency(), r.expectedBy(), plan));
        return ResponseEntity.created(URI.create("/v1/items/" + item.id()))
                .body(response(item, letters.replyAddress(item), null));
    }

    @GetMapping
    public List<ItemResponse> list(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) Set<ItemStatus> status,
            @RequestParam(defaultValue = "50") int limit, @RequestParam(defaultValue = "0") int offset) {
        Set<ItemStatus> statuses = status == null || status.isEmpty() ? null : EnumSet.copyOf(status);
        return service.list(jwt.getSubject(), statuses, limit, offset).stream()
                .map(i -> response(i, letters.replyAddress(i), null)).toList();
    }

    @GetMapping("/{id}")
    public ItemResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return detail(service.get(jwt.getSubject(), id));
    }

    @PostMapping("/{id}/resolve")
    public ItemResponse resolve(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @Valid @RequestBody(required = false) ResolveRequest r) {
        WaitingItem item = service.resolve(jwt.getSubject(), id, r == null ? null : r.outcome());
        return response(item, letters.replyAddress(item), null);
    }

    @PostMapping("/{id}/snooze")
    public ItemResponse snooze(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @Valid @RequestBody SnoozeRequest r) {
        return detail(service.snooze(jwt.getSubject(), id, r.days()));
    }

    /**
     * Records the counterparty's reply on the item. The response says how it was classified and whether it was applied;
     * the follow-up stage moves through the workflow, so read the item again to see the new stage.
     */
    @PostMapping("/{id}/replies")
    public InboundEmailService.Result reply(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @Valid @RequestBody ReplyRequest r) {
        WaitingItem item = service.get(jwt.getSubject(), id).item();
        String from = r.from() == null || r.from().isBlank() ? item.counterparty() : r.from().trim();
        return replies.recordPastedReply(item, from, r.subject(), r.text());
    }

    @PostMapping("/{id}/cancel")
    public ItemResponse cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        WaitingItem item = service.cancel(jwt.getSubject(), id);
        return response(item, letters.replyAddress(item), null);
    }

    @GetMapping("/{id}/timeline")
    public List<TimelineResponse> timeline(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.timeline(jwt.getSubject(), id).stream()
                .map(e -> new TimelineResponse(e.id(), e.type(), e.summary(), e.detail(), e.occurredAt())).toList();
    }

    /** Preview of the letter the workflow would produce, as of today. Nothing is sent or stored. */
    @GetMapping("/{id}/draft")
    public DraftResponse draft(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @RequestParam(defaultValue = "ESCALATION") Tone tone) {
        Letter l = service.draft(jwt.getSubject(), id, tone);
        return new DraftResponse(tone, l.subject(), l.body(), DRAFT_NOTE);
    }

    private ItemResponse detail(ItemDetail d) {
        return response(d.item(), d.replyAddress(), d.followUp().map(FollowUpView::of).orElse(null));
    }

    private static ItemResponse response(WaitingItem i, String replyAddress, FollowUpView followUp) {
        return new ItemResponse(i.id(), i.title(), i.counterparty(), i.counterpartyEmail(), i.category(), i.amount(),
                i.currency(), i.expectedBy(), i.status(), i.outcome(), replyAddress, PlanView.of(i.plan()),
                i.createdAt(), i.updatedAt(), i.closedAt(), followUp);
    }
}
