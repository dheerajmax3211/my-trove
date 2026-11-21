package com.personalplatform.waitingon.reply;

/**
 * Decides what an inbound reply means. Implementations must be side-effect free and fast: they run inside the
 * webhook request.
 *
 * <p>Extension point: the default bean is {@link RuleBasedReplyClassifier} (deterministic, offline). To use an
 * LLM, declare another {@code ReplyClassifier} bean; the default backs off ({@code @ConditionalOnMissingBean}).
 * Recommended shape of such an implementation: call the model with the subject and the already-trimmed reply text,
 * constrain the answer to the four {@link ReplyOutcome} values, enforce a timeout, and fall back to
 * {@code new RuleBasedReplyClassifier().classify(...)} when the model errors, times out or answers UNKNOWN.
 * Never pass the owner's identity or other items to the model.
 */
public interface ReplyClassifier {

    ReplyOutcome classify(String subject, String body);
}
