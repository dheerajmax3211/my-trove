package com.personalplatform.waitingon.inbound;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Real-world shaped reply bodies (Gmail, Outlook desktop / web, Apple Mail, plain clients). */
class QuotedReplyStripperTest {

    @Test
    void gmailAttributionOnOneLine() {
        String body = """
                Hi, your refund has been processed and will arrive in 3 days.

                Thanks,
                Sam

                On Tue, 24 Nov 2026 at 10:12, Dheeraj <waiting+0123456789abcdef0123@reply.example.com> wrote:
                > Hello, I am still waiting for the refund of my order 1234.
                > Regards
                """;
        assertThat(QuotedReplyStripper.strip(body))
                .isEqualTo("Hi, your refund has been processed and will arrive in 3 days.\n\nThanks,\nSam");
    }

    @Test
    void gmailAttributionWrappedOverTwoLines() {
        String body = """
                We need a copy of the invoice before we can continue.

                On Tue, 24 Nov 2026 at 10:12, Shop Support Team of a Very Long Name <
                support@shop.example> wrote:

                > Please refund my order.
                """;
        assertThat(QuotedReplyStripper.strip(body)).isEqualTo("We need a copy of the invoice before we can continue.");
    }

    @Test
    void outlookDesktopOriginalMessageBlock() {
        String body = """
                Your claim was declined.

                -----Original Message-----
                From: Dheeraj <waiting+0123456789abcdef0123@reply.example.com>
                Sent: Tuesday, November 24, 2026 10:12 AM
                To: Claims <claims@insurer.example>
                Subject: Following up: claim 88

                Has the claim been paid?
                """;
        assertThat(QuotedReplyStripper.strip(body)).isEqualTo("Your claim was declined.");
    }

    @Test
    void outlookWebHeaderBlockAfterUnderscoreRule() {
        String body = """
                Approved, the payment goes out on Friday.

                Get Outlook for iOS
                ________________________________
                From: Dheeraj <waiting+0123456789abcdef0123@reply.example.com>
                Sent: Tuesday, November 24, 2026 10:12
                To: Finance <finance@corp.example>
                Subject: Following up: expenses
                """;
        assertThat(QuotedReplyStripper.strip(body)).isEqualTo("Approved, the payment goes out on Friday.");
    }

    @Test
    void outlookHeaderBlockWithoutSeparatorLine() {
        String body = """
                Paid today.

                From: Dheeraj <waiting+0123456789abcdef0123@reply.example.com>
                Date: Tuesday, 24 November 2026 at 10:12
                To: Shop <help@shop.example>
                Subject: Refund
                """;
        assertThat(QuotedReplyStripper.strip(body)).isEqualTo("Paid today.");
    }

    @Test
    void aFromLineInsideTheReplyIsKeptWhenNoHeaderBlockFollows() {
        String body = "From: the accounts team\nYour refund was sent.\nThanks";
        assertThat(QuotedReplyStripper.strip(body)).isEqualTo(body);
    }

    @Test
    void signaturesAndMobileFootersAreCut() {
        assertThat(QuotedReplyStripper.strip("Refund sent.\n\n-- \nSam Smith\nShop Ltd | +44 20 0000 0000"))
                .isEqualTo("Refund sent.");
        assertThat(QuotedReplyStripper.strip("Refund sent.\n\nSent from my iPhone")).isEqualTo("Refund sent.");
        assertThat(QuotedReplyStripper.strip("Refund sent.\nSent from Outlook for Android")).isEqualTo("Refund sent.");
    }

    @Test
    void interleavedQuoteLinesAreDroppedButTheAnswersStay() {
        String body = """
                > Has the refund been sent?
                Yes, yesterday.
                > When will it arrive?
                Within 3 working days.
                """;
        assertThat(QuotedReplyStripper.strip(body)).isEqualTo("Yes, yesterday.\nWithin 3 working days.");
    }

    @Test
    void plainReplyWithoutHistoryIsUnchangedApartFromTrimming() {
        assertThat(QuotedReplyStripper.strip("  \r\nThe item was dispatched today.\r\n\r\n\r\n\r\nRegards\r\n"))
                .isEqualTo("The item was dispatched today.\n\nRegards");
    }

    @Test
    void forwardedMessageMarkerCuts() {
        assertThat(QuotedReplyStripper.strip("See below, approved.\n\n---------- Forwarded message ---------\nFrom: x"))
                .isEqualTo("See below, approved.");
    }

    @Test
    void whenEverythingIsQuotedTheTextIsKeptRatherThanLost() {
        String body = "> refund has been processed\n> regards";
        assertThat(QuotedReplyStripper.strip(body)).isEqualTo(body);
    }

    @Test
    void capsTheLength() {
        assertThat(QuotedReplyStripper.strip("a".repeat(50_000))).hasSize(QuotedReplyStripper.MAX_CHARS);
        assertThat(QuotedReplyStripper.strip(null)).isEmpty();
    }
}
