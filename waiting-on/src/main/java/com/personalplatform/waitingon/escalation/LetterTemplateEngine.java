package com.personalplatform.waitingon.escalation;

import com.personalplatform.waitingon.item.ItemCategory;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Small, pure template engine for follow-up messages: {@code {{name}}} placeholders, no I/O, no clock.
 * Wording is jurisdiction-neutral consumer-rights style; it cites well known instruments as examples and is NOT legal
 * advice (see README). Substituted values are never re-scanned, so user input such as a title containing
 * "{{x}}" cannot inject placeholders.
 */
public final class LetterTemplateEngine {

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{(\\w+)}}");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH);

    /** Category specific wording. Snippets may themselves contain placeholders. */
    private record Wording(String situation, String rights, String demand, String consequence) {
    }

    private static final Map<ItemCategory, Wording> WORDING = new EnumMap<>(ItemCategory.class);

    static {
        WORDING.put(ItemCategory.REFUND, new Wording(
                "I requested a refund{{amountPhrase}} in connection with \"{{title}}\". I expected to receive it by "
                        + "{{expectedBy}}; as of {{today}} it is {{daysOverdue}} day(s) overdue and I have been waiting "
                        + "{{daysWaiting}} day(s).",
                "Under consumer protection law (for example, in the UK the Consumer Rights Act 2015 and the Consumer "
                        + "Contracts (Information, Cancellation and Additional Charges) Regulations 2013, and in the EU "
                        + "Directive 2011/83/EU on consumer rights), a consumer who is entitled to a refund must receive "
                        + "it without undue delay, and for a cancelled distance contract no later than 14 days after the "
                        + "trader is informed of the decision. I am entitled to a full refund to my original payment method.",
                "refund the full amount to my original payment method",
                "If I do not receive the refund by then I will dispute the charge with my card issuer or payment "
                        + "provider (chargeback, or a Section 75 claim where available), report the matter to the "
                        + "relevant consumer protection authority, and consider a small-claims action."));
        WORDING.put(ItemCategory.CLAIM, new Wording(
                "I submitted a claim{{amountPhrase}} regarding \"{{title}}\". A decision or payment was expected by "
                        + "{{expectedBy}}; as of {{today}} that is {{daysOverdue}} day(s) ago and I have been waiting "
                        + "{{daysWaiting}} day(s).",
                "An insurer is required to handle claims promptly, fairly and reasonably and must not unreasonably "
                        + "delay or withhold payment of a valid claim (for example the UK Insurance Act 2015, s.13A, and "
                        + "the FCA ICOBS 8.1 claims-handling rules; unfair claims settlement practices legislation in "
                        + "most US states and equivalent rules elsewhere).",
                "give me a written decision on my claim and, where it is covered, pay it in full",
                "If I do not receive a decision and payment by then I will lodge a formal complaint and, once your "
                        + "internal process is exhausted or the regulator's deadline has passed, refer the matter to the "
                        + "Financial Ombudsman Service or the competent insurance regulator or ombudsman."));
        WORDING.put(ItemCategory.REIMBURSEMENT, new Wording(
                "I submitted an expense reimbursement{{amountPhrase}} for \"{{title}}\", due by {{expectedBy}}. As of "
                        + "{{today}} it is {{daysOverdue}} day(s) overdue and I have been waiting {{daysWaiting}} day(s).",
                "Business expenses properly incurred and submitted under the applicable expenses policy are owed to me "
                        + "under the terms of my agreement with you, and in some jurisdictions unpaid reimbursements can "
                        + "be treated as wages owed (for example, unlawful deductions or late payment provisions in "
                        + "employment legislation). Please treat this as a formal request under that policy.",
                "pay the outstanding reimbursement in full",
                "If it is not paid by then I will raise the matter with HR and finance leadership and take advice "
                        + "about the formal remedies available to me."));
        WORDING.put(ItemCategory.APPROVAL, new Wording(
                "I am waiting for a decision on \"{{title}}\"{{amountPhrase}}, which I expected by {{expectedBy}}. As "
                        + "of {{today}} it is {{daysOverdue}} day(s) overdue and I have been waiting {{daysWaiting}} "
                        + "day(s).",
                "Organisations and public bodies are expected to decide applications within any statutory or published "
                        + "service-standard time limit, and otherwise within a reasonable time, and to give reasons. "
                        + "Please confirm which time limit applies to my request.",
                "give me a written decision, or tell me precisely what is outstanding and the date by which a decision "
                        + "will be made",
                "If I do not receive a decision by then I will start your formal complaints or internal review "
                        + "procedure and, if necessary, refer the matter to the competent ombudsman or regulator."));
        WORDING.put(ItemCategory.DELIVERY, new Wording(
                "I ordered \"{{title}}\"{{amountPhrase}} for delivery by {{expectedBy}}. As of {{today}} it is "
                        + "{{daysOverdue}} day(s) late and I have been waiting {{daysWaiting}} day(s).",
                "Under consumer protection law (for example the UK Consumer Rights Act 2015, s.28, and Article 18 of "
                        + "EU Directive 2011/83/EU) goods must be delivered within the agreed time, or within 30 days "
                        + "of the order if none was agreed. If they are not, I may set a final deadline and then treat "
                        + "the contract as ended and require a full refund.",
                "deliver my order, or confirm in writing that you will refund me in full",
                "If neither happens by then I will treat the contract as ended, claim a full refund through my card "
                        + "issuer or payment provider, and report the matter to the consumer protection authority."));
        WORDING.put(ItemCategory.OTHER, new Wording(
                "I have been waiting since {{createdOn}} for \"{{title}}\"{{amountPhrase}}, which I expected by "
                        + "{{expectedBy}}. As of {{today}} it is {{daysOverdue}} day(s) overdue.",
                "I am relying on the commitment you made to me and on my rights under the agreement between us and "
                        + "under applicable law, including the duty to perform obligations within a reasonable time.",
                "do what you committed to, or confirm in writing exactly when I will receive it",
                "If I do not hear from you by then I will use the complaint, regulatory and legal routes available "
                        + "to me."));
    }

    public Letter draft(Tone tone, LetterContext c) {
        Map<String, String> vars = variables(c);
        return switch (tone) {
            case NUDGE -> nudge(vars);
            case ESCALATION -> formal(tone, vars, c.category(), 14, c.today());
            case FINAL_NOTICE -> formal(tone, vars, c.category(), 7, c.today());
        };
    }

    private Letter nudge(Map<String, String> v) {
        String body = render("""
                Hello {{counterparty}},

                I am following up on "{{title}}"{{amountPhrase}}. I was expecting this by {{expectedBy}} and it \
                is now {{daysOverdue}} day(s) past that date.

                Could you please let me know the current status and when I can expect it to be completed? \
                If you need anything further from me, just reply to this message and I will send it right away.

                Many thanks,
                {{senderName}}
                Reply to: {{replyTo}}
                """, v);
        return new Letter(render("Following up: {{title}}", v), body);
    }

    private Letter formal(Tone tone, Map<String, String> base, ItemCategory category, int deadlineDays,
            LocalDate today) {
        Wording w = WORDING.get(category);
        Map<String, String> v = new HashMap<>(base);
        v.put("deadlineDays", Integer.toString(deadlineDays));
        v.put("deadlineDate", DATE.format(today.plusDays(deadlineDays)));
        // two passes: category snippets first (they contain placeholders), then the frame
        v.put("situation", render(w.situation(), v));
        v.put("rights", render(w.rights(), v));
        v.put("demand", render(w.demand(), v));
        v.put("consequence", render(w.consequence(), v));
        boolean fin = tone == Tone.FINAL_NOTICE;
        v.put("heading", fin ? "FINAL NOTICE" : "FORMAL COMPLAINT AND REQUEST FOR ACTION");
        v.put("opening", fin
                ? "I wrote to you previously and have not received what I am owed. This is my final notice before I "
                        + "take further action."
                : "I am writing to formally escalate an unresolved matter. My earlier reminder did not produce a "
                        + "resolution.");
        String body = render("""
                {{heading}}

                Dear {{counterparty}},

                Re: {{title}}

                {{opening}}

                {{situation}}

                {{rights}}

                I therefore ask you to {{demand}} within {{deadlineDays}} days of the date of this letter, that is by \
                {{deadlineDate}}. {{consequence}}

                Please send your reply to {{replyTo}} and keep a written record of any further communication.

                Yours faithfully,
                {{senderName}}
                """, v);
        String subject = (fin ? "FINAL NOTICE: " : "Formal complaint: ") + base.get("title");
        return new Letter(subject, body);
    }

    private static Map<String, String> variables(LetterContext c) {
        Map<String, String> v = new HashMap<>();
        v.put("title", c.title());
        v.put("counterparty", c.counterparty());
        v.put("expectedBy", DATE.format(c.expectedBy()));
        v.put("createdOn", DATE.format(c.createdOn()));
        v.put("today", DATE.format(c.today()));
        v.put("daysOverdue", Long.toString(Math.max(0, ChronoUnit.DAYS.between(c.expectedBy(), c.today()))));
        v.put("daysWaiting", Long.toString(Math.max(0, ChronoUnit.DAYS.between(c.createdOn(), c.today()))));
        v.put("amountPhrase", amountPhrase(c.amount(), c.currency()));
        v.put("senderName", c.senderName() == null || c.senderName().isBlank() ? "[Your name]" : c.senderName());
        v.put("replyTo", c.replyTo() == null || c.replyTo().isBlank() ? "[your email address]" : c.replyTo());
        return v;
    }

    private static String amountPhrase(BigDecimal amount, String currency) {
        if (amount == null) {
            return "";
        }
        return " of " + (currency == null ? "" : currency + " ") + amount.stripTrailingZeros().toPlainString();
    }

    /** Replaces every {{name}}; an unknown placeholder is a programming error, not something to hide. */
    static String render(String template, Map<String, String> vars) {
        Matcher m = PLACEHOLDER.matcher(template);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String value = vars.get(m.group(1));
            if (value == null) {
                throw new IllegalArgumentException("No value for placeholder {{" + m.group(1) + "}}");
            }
            m.appendReplacement(out, Matcher.quoteReplacement(value));
        }
        m.appendTail(out);
        return out.toString();
    }
}
