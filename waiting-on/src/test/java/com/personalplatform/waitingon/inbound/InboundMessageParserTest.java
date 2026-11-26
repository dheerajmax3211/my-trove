package com.personalplatform.waitingon.inbound;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.waitingon.inbound.InboundMessageParser.ParsedReply;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

/** Raw messages shaped like what Gmail, Outlook and plain clients put on the wire. */
class InboundMessageParserTest {

    private static ParsedReply parse(String raw) throws Exception {
        return InboundMessageParser.parse(raw.replace("\n", "\r\n").getBytes(StandardCharsets.UTF_8),
                "bounce@envelope.example");
    }

    @Test
    void gmailMultipartAlternativePrefersThePlainPartAndStripsTheQuote() throws Exception {
        ParsedReply r = parse("""
                MIME-Version: 1.0
                From: Shop Support <support@shop.example>
                Date: Tue, 24 Nov 2026 11:02:13 +0000
                Message-ID: <CAF=abc123@mail.gmail.com>
                Subject: Re: Following up: Hotel refund
                To: waiting+0123456789abcdef0123@reply.example.com
                Content-Type: multipart/alternative; boundary="000000000000b1c2d3"

                --000000000000b1c2d3
                Content-Type: text/plain; charset="UTF-8"
                Content-Transfer-Encoding: quoted-printable

                Hi, your refund has been processed and will arrive in 3 days =E2=80=93 sorry=
                 for the wait.

                On Tue, 24 Nov 2026 at 10:12, Dheeraj <waiting+0123456789abcdef0123@reply.exa=
                mple.com> wrote:

                > Hello, is my refund on its way?
                >

                --000000000000b1c2d3
                Content-Type: text/html; charset="UTF-8"

                <div dir=3D"ltr">HTML version</div>

                --000000000000b1c2d3--
                """);
        assertThat(r.from()).isEqualTo("support@shop.example");
        assertThat(r.subject()).isEqualTo("Re: Following up: Hotel refund");
        assertThat(r.messageId()).isEqualTo("<CAF=abc123@mail.gmail.com>");
        assertThat(r.text()).isEqualTo("Hi, your refund has been processed and will arrive in 3 days – sorry for the wait.");
    }

    @Test
    void outlookHtmlOnlyIsConvertedToTextAndTheHeaderBlockIsCut() throws Exception {
        ParsedReply r = parse("""
                MIME-Version: 1.0
                From: "Claims Team" <claims@insurer.example>
                Message-ID: <AM0PR01MB1234@eurprd01.prod.outlook.com>
                Subject: RE: Following up: claim 88
                Content-Type: text/html; charset="iso-8859-1"
                Content-Transfer-Encoding: quoted-printable

                <html><head><style>p {margin:0}</style></head><body>
                <div>We regret that your claim has been declined.</div><div><br></div>
                <div>Kind&nbsp;regards,<br>Claims</div>
                <hr style=3D"display:inline-block;width:98%">
                <div id=3D"divRplyFwdMsg"><b>From:</b> Dheeraj &lt;waiting+0123456789abcdef0123@reply.example.com&gt;<br>
                <b>Sent:</b> Tuesday, November 24, 2026 10:12 AM<br>
                <b>To:</b> Claims<br><b>Subject:</b> Following up: claim 88</div>
                <div>Has the claim been paid?</div>
                </body></html>
                """);
        assertThat(r.from()).isEqualTo("claims@insurer.example");
        assertThat(r.text()).isEqualTo("We regret that your claim has been declined.\n\nKind regards,\nClaims");
    }

    @Test
    void htmlBlockquoteHistoryIsDropped() throws Exception {
        ParsedReply r = parse("""
                From: a@b.example
                Subject: Re
                Content-Type: text/html; charset=UTF-8

                <div>Approved.</div><div class="gmail_quote"><blockquote class="gmail_quote">
                Please approve<blockquote>older quote</blockquote></blockquote></div>
                """);
        assertThat(r.text()).isEqualTo("Approved.");
    }

    @Test
    void plainMessageWithAnAttachmentUsesTheBodyNotTheAttachment() throws Exception {
        ParsedReply r = parse("""
                From: finance@corp.example
                Subject: Re: expenses
                Content-Type: multipart/mixed; boundary="b1"

                --b1
                Content-Type: text/plain; charset=us-ascii

                The reimbursement has been paid, receipt attached.

                --b1
                Content-Type: text/plain; name="receipt.txt"
                Content-Disposition: attachment; filename="receipt.txt"

                RECEIPT 0001
                --b1--
                """);
        assertThat(r.text()).isEqualTo("The reimbursement has been paid, receipt attached.");
    }

    @Test
    void missingFromHeaderFallsBackToTheEnvelopeSenderAndUnknownCharsetsStillRead() throws Exception {
        ParsedReply r = parse("""
                Subject: dispatched
                Content-Type: text/plain; charset=x-unknown-charset

                Your parcel was dispatched today.
                """);
        assertThat(r.from()).isEqualTo("bounce@envelope.example");
        assertThat(r.messageId()).isNull();
        assertThat(r.text()).isEqualTo("Your parcel was dispatched today.");
    }

    @Test
    void emptyBodyGivesEmptyText() throws Exception {
        assertThat(parse("From: a@b.example\nSubject: hi\n\n").text()).isEmpty();
    }
}
