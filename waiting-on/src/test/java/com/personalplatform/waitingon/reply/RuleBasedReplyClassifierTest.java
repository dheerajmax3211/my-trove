package com.personalplatform.waitingon.reply;

import static com.personalplatform.waitingon.reply.ReplyOutcome.NEEDS_INFO;
import static com.personalplatform.waitingon.reply.ReplyOutcome.PAID;
import static com.personalplatform.waitingon.reply.ReplyOutcome.REJECTED;
import static com.personalplatform.waitingon.reply.ReplyOutcome.UNKNOWN;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class RuleBasedReplyClassifierTest {

    private final ReplyClassifier classifier = new RuleBasedReplyClassifier();

    static Stream<Arguments> cases() {
        return Stream.of(
                // PAID
                Arguments.of("Re: refund", "Good news, your refund has been processed and will reach you in 3 days.", PAID),
                Arguments.of("Claim update", "We have approved your claim and the payment was sent today.", PAID),
                Arguments.of("Payment", "The amount was credited to your account ending 4242.", PAID),
                Arguments.of("Re: expenses", "Your reimbursement is approved.", PAID),
                Arguments.of("Order", "Your parcel has been shipped.", PAID),
                Arguments.of("Re: refund request", "We've refunded the full amount.", PAID),
                Arguments.of("Re: refund", "Your refund of $120.50 was issued on Monday.", PAID),
                // REJECTED
                Arguments.of("Re: claim", "We regret to inform you that your claim has been declined.", REJECTED),
                Arguments.of("Re: refund", "Unfortunately we are unable to refund this order.", REJECTED),
                Arguments.of("Decision", "Your request was rejected under section 4.", REJECTED),
                Arguments.of("Re: approval", "Your application has not been approved.", REJECTED),
                Arguments.of("Re: refund", "This item is non-refundable.", REJECTED),
                Arguments.of("Re: refund", "You are not eligible for a refund.", REJECTED),
                Arguments.of("Re: claim", "We can't reimburse this expense.", REJECTED),
                // negation must beat the positive keyword it contains
                Arguments.of("Re: claim", "Your claim was not approved.", REJECTED),
                // NEEDS_INFO
                Arguments.of("Re: claim", "Please send us a copy of the invoice so we can continue.", NEEDS_INFO),
                Arguments.of("Re: refund", "We need additional information before we can proceed.", NEEDS_INFO),
                Arguments.of("Re: claim", "Could you please provide your policy number?", NEEDS_INFO),
                Arguments.of("Re: refund", "We will refund you once you send the original receipt.", NEEDS_INFO),
                Arguments.of("Re: expenses", "Approved, but please provide your bank details.", NEEDS_INFO),
                // UNKNOWN / pending
                Arguments.of("Re: refund", "Thanks for contacting us. A specialist will look into it.", UNKNOWN),
                Arguments.of("Re: refund", "Your refund has not yet been processed.", UNKNOWN),
                Arguments.of("Re: refund", "Payment hasn't been made yet, please bear with us.", UNKNOWN),
                Arguments.of("Re: refund", "We will refund you within 5 to 7 business days.", UNKNOWN),
                Arguments.of("Re: claim", "Your claim will be approved after review.", UNKNOWN),
                Arguments.of("Out of office", "I am out of the office until Monday.", UNKNOWN),
                Arguments.of("", "", UNKNOWN));
    }

    @ParameterizedTest(name = "[{index}] {2}: {1}")
    @MethodSource("cases")
    void classifies(String subject, String body, ReplyOutcome expected) {
        assertThat(classifier.classify(subject, body)).isEqualTo(expected);
    }

    @Test
    void nullInputsAreUnknown() {
        assertThat(classifier.classify(null, null)).isEqualTo(UNKNOWN);
    }

    @Test
    void subjectCounts() {
        assertThat(classifier.classify("Your refund has been processed", "See attached.")).isEqualTo(PAID);
    }

    @Test
    void curlyApostropheIsHandled() {
        assertThat(classifier.classify("Re: claim", "We can’t reimburse this expense.")).isEqualTo(REJECTED);
    }

    @Test
    void quotedHistoryIsIgnored() {
        String body = """
                Thanks, we are looking into it.

                On Tue, 3 Mar 2026 at 10:00, Alice <alice@example.com> wrote:
                > Please confirm my refund has been processed, it has been declined twice already.
                """;
        assertThat(classifier.classify("Re: refund", body)).isEqualTo(UNKNOWN);
        assertThat(classifier.classify("Re: refund", "> refund declined\nYour refund was issued.")).isEqualTo(PAID);
    }

    @Test
    void shoutingIsCaseInsensitive() {
        assertThat(classifier.classify("RE: CLAIM", "YOUR CLAIM HAS BEEN DENIED")).isEqualTo(REJECTED);
    }
}
