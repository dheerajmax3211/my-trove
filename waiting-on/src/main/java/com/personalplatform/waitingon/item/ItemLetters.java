package com.personalplatform.waitingon.item;

import com.personalplatform.waitingon.escalation.Letter;
import com.personalplatform.waitingon.escalation.LetterContext;
import com.personalplatform.waitingon.escalation.LetterTemplateEngine;
import com.personalplatform.waitingon.escalation.Tone;
import com.personalplatform.waitingon.inbound.ReplyAddresses;
import java.time.Clock;
import java.time.LocalDate;
import org.springframework.stereotype.Component;

/** Glue between a stored item and the pure template engine (adds "today" and the reply address). */
@Component
public class ItemLetters {

    private final LetterTemplateEngine engine = new LetterTemplateEngine();
    private final ReplyAddresses addresses;
    private final Clock clock;

    public ItemLetters(ReplyAddresses addresses, Clock clock) {
        this.addresses = addresses;
        this.clock = clock;
    }

    public Letter draft(Tone tone, WaitingItem item) {
        LocalDate today = LocalDate.now(clock);
        LetterContext ctx = new LetterContext(item.title(), item.counterparty(), item.category(), item.amount(),
                item.currency(), item.expectedBy(), item.createdAt().atZoneSameInstant(clock.getZone()).toLocalDate(),
                today, null, addresses.addressFor(item.replyToken()));
        return engine.draft(tone, ctx);
    }

    public String replyAddress(WaitingItem item) {
        return addresses.addressFor(item.replyToken());
    }
}
