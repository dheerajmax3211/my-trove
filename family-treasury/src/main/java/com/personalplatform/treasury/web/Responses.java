package com.personalplatform.treasury.web;

import com.personalplatform.treasury.ledger.IdempotencyService.Outcome;
import org.springframework.http.ResponseEntity;

final class Responses {

    private Responses() {}

    /** Replays carry the original status and body plus {@code Idempotent-Replayed: true}. */
    static <T> ResponseEntity<T> of(Outcome<T> outcome) {
        ResponseEntity.BodyBuilder b = ResponseEntity.status(outcome.status());
        if (outcome.replayed()) {
            b.header("Idempotent-Replayed", "true");
        }
        return b.body(outcome.body());
    }
}
