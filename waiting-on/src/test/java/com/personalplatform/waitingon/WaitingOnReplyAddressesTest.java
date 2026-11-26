package com.personalplatform.waitingon;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.waitingon.inbound.InboundProperties;
import com.personalplatform.waitingon.inbound.ReplyAddresses;
import org.junit.jupiter.api.Test;

class WaitingOnReplyAddressesTest {

    private static final String TOKEN = "0123456789abcdef0123";

    @Test
    void parsesPlusAddressesInCommonHeaderShapes() {
        assertThat(ReplyAddresses.extractToken("waiting+" + TOKEN + "@reply.example.com")).contains(TOKEN);
        assertThat(ReplyAddresses.extractToken("Waiting <WAITING+" + TOKEN.toUpperCase() + "@reply.example.com>"))
                .contains(TOKEN);
        assertThat(ReplyAddresses.extractToken("a@b.com, Support <waiting+" + TOKEN + "@x.io>, c@d.com"))
                .contains(TOKEN);
    }

    @Test
    void ignoresAnythingElse() {
        assertThat(ReplyAddresses.extractToken(null)).isEmpty();
        assertThat(ReplyAddresses.extractToken("")).isEmpty();
        assertThat(ReplyAddresses.extractToken("waiting@reply.example.com")).isEmpty();
        assertThat(ReplyAddresses.extractToken("waiting+short@reply.example.com")).isEmpty();
        assertThat(ReplyAddresses.extractToken("other+" + TOKEN + "@reply.example.com")).isEmpty();
        assertThat(ReplyAddresses.extractToken("waiting+" + TOKEN + "zz@reply.example.com")).isEmpty();
    }

    @Test
    void smtpRecipientsMustBeExactlyOurAddressOnOurDomain() {
        ReplyAddresses addresses = new ReplyAddresses(new InboundProperties("s", "reply.example.com"));
        assertThat(addresses.tokenForRecipient("waiting+" + TOKEN + "@reply.example.com")).contains(TOKEN);
        assertThat(addresses.tokenForRecipient("WAITING+" + TOKEN.toUpperCase() + "@Reply.Example.COM")).contains(TOKEN);
        assertThat(addresses.tokenForRecipient("waiting+" + TOKEN + "@reply.example.com.evil.example")).isEmpty();
        assertThat(addresses.tokenForRecipient("waiting+" + TOKEN + "@other.example")).isEmpty();
        assertThat(addresses.tokenForRecipient("x.waiting+" + TOKEN + "@reply.example.com")).isEmpty();
        assertThat(addresses.tokenForRecipient("Name <waiting+" + TOKEN + "@reply.example.com>")).isEmpty();
        assertThat(addresses.tokenForRecipient("waiting@reply.example.com")).isEmpty();
        assertThat(addresses.tokenForRecipient(null)).isEmpty();
    }

    @Test
    void generatedTokensRoundTrip() {
        ReplyAddresses addresses = new ReplyAddresses(new InboundProperties("s", "reply.example.com"));
        String token = ReplyAddresses.newToken();
        assertThat(token).matches("[a-f0-9]{20}");
        assertThat(ReplyAddresses.extractToken(addresses.addressFor(token))).contains(token);
        assertThat(ReplyAddresses.newToken()).isNotEqualTo(token);
    }
}
