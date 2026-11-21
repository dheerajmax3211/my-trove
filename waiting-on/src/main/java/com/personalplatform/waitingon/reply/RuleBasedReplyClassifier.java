package com.personalplatform.waitingon.reply;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Ordered keyword rules; the first rule that matches wins. Order matters and is deliberate:
 * <ol>
 *   <li>"not yet ..." (pending) is UNKNOWN, so a delay is never mistaken for payment;</li>
 *   <li>explicit refusal / negated approval is REJECTED, so "not approved" is never mistaken for "approved";</li>
 *   <li>requests for documents or details are NEEDS_INFO ("approved, but please send your bank details");</li>
 *   <li>future-tense promises ("will be refunded") are UNKNOWN, not PAID;</li>
 *   <li>completed-payment phrases are PAID.</li>
 * </ol>
 * Quoted history (lines starting with '>' and everything after "On ... wrote:") is ignored so that our own earlier
 * message ("please refund") does not influence the result.
 */
public class RuleBasedReplyClassifier implements ReplyClassifier {

    private record Rule(ReplyOutcome outcome, Pattern pattern) {
        Rule(ReplyOutcome outcome, String regex) {
            this(outcome, Pattern.compile(regex));
        }
    }

    private static final Pattern QUOTE_HEADER =
            Pattern.compile("(?s)\\n\\s*(on .{5,120} wrote:|-----\\s*original message\\s*-----|from:\\s.*\\nsent:).*$");

    private static final String DOCS =
            "(document|documents|invoice|receipt|proof|form|details|information|statement|copy|number|evidence|photo|"
                    + "id|identification|paperwork|screenshot)s?";

    private static final List<Rule> RULES = List.of(
            // 1. "not yet paid / hasn't been processed yet" is pending, never PAID
            new Rule(ReplyOutcome.UNKNOWN,
                    "\\bnot yet (been )?(paid|refunded|processed|approved|issued|credited|sent|received)\\b"
                            + "|\\b(has|have|hasn't|haven't) (not )?(been )?(paid|refunded|processed|approved|issued)"
                            + " yet\\b"),
            // 2. refusals and negated approvals
            new Rule(ReplyOutcome.REJECTED,
                    "\\b(denied|declined|rejected|refuse[sd]?)\\b"
                            + "|\\bnot (been )?(approved|eligible|covered|refundable|entitled)\\b"
                            + "|\\bnot be (approved|refunded|paid|reimbursed)\\b"
                            + "|\\b(unable|cannot|can't|can not|won't|will not) (to )?(approve|refund|reimburse|pay|honou?r)\\b"
                            + "|\\bregret to (inform|advise)\\b"
                            + "|\\bno refund\\b|\\bnot (a )?valid claim\\b|\\bnon-refundable\\b"),
            // 3. they are waiting on us
            new Rule(ReplyOutcome.NEEDS_INFO,
                    "\\b(please|kindly) (provide|send|submit|upload|attach|confirm|supply|forward|share)\\b.{0,60}\\b"
                            + DOCS + "\\b"
                            + "|\\b(need|require)s? (more|further|additional|some|the following|your)\\b"
                            + "|\\b(additional|further|missing|supporting) (information|documents?|details|evidence|proof)\\b"
                            + "|\\bcould you (please )?(send|provide|confirm|share)\\b"
                            + "|\\b(once|until|when) (we|you) (receive|provide|send|have received)\\b"),
            // 4. promises about the future are not payment
            new Rule(ReplyOutcome.UNKNOWN,
                    "\\bwill be (paid|refunded|approved|processed|issued|credited|reimbursed)\\b"
                            + "|\\bwill (refund|pay|reimburse|approve|process|issue|credit)\\b"
                            + "|\\bunder (review|investigation|consideration)\\b"),
            // 5. completed
            new Rule(ReplyOutcome.PAID,
                    "\\b(has|have|had|was|were) been (paid|refunded|processed|approved|issued|credited|reimbursed|"
                            + "dispatched|shipped|delivered)\\b"
                            + "|\\bwe('ve| have) (refunded|paid|processed|issued|credited|approved|reimbursed|sent|"
                            + "dispatched|shipped)\\b"
                            + "|\\b(refund|payment|reimbursement|transfer|claim) (of .{1,40} )?(is|was) "
                            + "(issued|processed|approved|sent|made|completed|on its way)\\b"
                            + "|\\bcredited (to|back)\\b|\\bpayment (sent|made|completed)\\b"
                            + "|\\bapproved\\b"));

    @Override
    public ReplyOutcome classify(String subject, String body) {
        String text = normalise((subject == null ? "" : subject) + "\n" + stripQuotedHistory(body));
        for (Rule rule : RULES) {
            if (rule.pattern().matcher(text).find()) {
                return rule.outcome();
            }
        }
        return ReplyOutcome.UNKNOWN;
    }

    static String stripQuotedHistory(String body) {
        if (body == null) {
            return "";
        }
        StringBuilder kept = new StringBuilder();
        for (String line : body.split("\\R")) {
            if (!line.stripLeading().startsWith(">")) {
                kept.append(line).append('\n');
            }
        }
        return QUOTE_HEADER.matcher("\n" + kept.toString().toLowerCase(Locale.ROOT)).replaceFirst("");
    }

    private static String normalise(String s) {
        return s.toLowerCase(Locale.ROOT).replace('’', '\'').replaceAll("\\s+", " ");
    }
}
