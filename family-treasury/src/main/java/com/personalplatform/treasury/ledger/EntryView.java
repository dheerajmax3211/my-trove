package com.personalplatform.treasury.ledger;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** A committed journal entry with its postings (signed minor units: positive = debit, negative = credit). */
public record EntryView(
        UUID id, UUID householdId, EntryKind kind, String description, Instant postedAt, UUID reversesEntryId,
        UUID approvalId, String createdByUid, List<PostingView> postings) {

    public record PostingView(UUID accountId, long amountMinor, String currency) {}
}
