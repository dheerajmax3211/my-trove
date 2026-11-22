package com.personalplatform.waitingon.escalation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.waitingon.item.ItemCategory;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

class LetterTemplateEngineTest {

    private final LetterTemplateEngine engine = new LetterTemplateEngine();

    private static LetterContext ctx(ItemCategory category, String title) {
        return new LetterContext(title, "Acme Insurance Ltd", category, new BigDecimal("1250.00"), "GBP",
                LocalDate.of(2026, 3, 1), LocalDate.of(2026, 2, 1), LocalDate.of(2026, 3, 11), "Dana Reyes",
                "waiting+abc@reply.example.com");
    }

    @ParameterizedTest
    @EnumSource(ItemCategory.class)
    void everyCategoryProducesACompleteFormalLetter(ItemCategory category) {
        Letter l = engine.draft(Tone.ESCALATION, ctx(category, "Water damage claim #8841"));

        assertThat(l.subject()).startsWith("Formal complaint:").contains("Water damage claim #8841");
        assertThat(l.body())
                .contains("Acme Insurance Ltd", "Water damage claim #8841", "GBP 1250", "1 March 2026",
                        "10 days", "within 14 days", "25 March 2026", "Dana Reyes",
                        "waiting+abc@reply.example.com")
                .doesNotContain("{{", "}}");
    }

    @ParameterizedTest
    @CsvSource({
            "REFUND,Consumer Rights Act 2015",
            "REFUND,chargeback",
            "CLAIM,Insurance Act 2015",
            "CLAIM,Ombudsman",
            "REIMBURSEMENT,expenses policy",
            "APPROVAL,reasonable time",
            "DELIVERY,30 days",
            "DELIVERY,treat the contract as ended",
            "OTHER,reasonable time"
    })
    void categoryWordingIsSpecific(ItemCategory category, String expectedPhrase) {
        assertThat(engine.draft(Tone.ESCALATION, ctx(category, "Thing")).body()).contains(expectedPhrase);
    }

    @ParameterizedTest
    @EnumSource(Tone.class)
    void dayCountsUseTheSingularForOneAndNeverShowPluralBrackets(Tone tone) {
        // 1 day overdue, waiting 2 days: singular for the one, plural for the other
        LetterContext c = new LetterContext("Thing", "Bob", ItemCategory.REFUND, null, null,
                LocalDate.of(2026, 3, 1), LocalDate.of(2026, 2, 27), LocalDate.of(2026, 3, 2), null, null);
        String body = engine.draft(tone, c).body();
        assertThat(body).doesNotContain("(s)", "day(s)", "1 days").contains("1 day");
    }

    @Test
    void zeroDaysOverdueReadsAsPlural() {
        LetterContext c = new LetterContext("Thing", "Bob", ItemCategory.CLAIM, null, null,
                LocalDate.of(2026, 3, 2), LocalDate.of(2026, 3, 1), LocalDate.of(2026, 3, 2), null, null);
        assertThat(engine.draft(Tone.NUDGE, c).body()).contains("0 days past that date")
                .doesNotContain("day(s)");
    }

    @Test
    void categoriesAreDistinguishable() {
        var bodies = java.util.Arrays.stream(ItemCategory.values())
                .map(c -> engine.draft(Tone.ESCALATION, ctx(c, "Thing")).body()).distinct().toList();
        assertThat(bodies).hasSize(ItemCategory.values().length);
    }

    @Test
    void finalNoticeIsShorterDeadlineAndSaysSo() {
        Letter l = engine.draft(Tone.FINAL_NOTICE, ctx(ItemCategory.REFUND, "Headphones"));
        assertThat(l.subject()).startsWith("FINAL NOTICE:");
        assertThat(l.body()).contains("FINAL NOTICE", "within 7 days", "18 March 2026").doesNotContain("{{");
    }

    @Test
    void nudgeIsFriendlyAndShort() {
        Letter l = engine.draft(Tone.NUDGE, ctx(ItemCategory.DELIVERY, "Sofa"));
        assertThat(l.subject()).isEqualTo("Following up: Sofa");
        assertThat(l.body()).contains("Hello Acme Insurance Ltd", "Could you please let me know")
                .doesNotContain("Consumer Rights", "FORMAL");
    }

    @Test
    void missingOptionalValuesGetPlaceholders() {
        LetterContext c = new LetterContext("Thing", "Bob", ItemCategory.OTHER, null, null, LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 3, 1), LocalDate.of(2026, 3, 1), null, null);
        Letter l = engine.draft(Tone.ESCALATION, c);
        assertThat(l.body()).contains("[Your name]", "[your email address]", "0 days overdue");
    }

    @Test
    void userInputCannotInjectPlaceholders() {
        Letter l = engine.draft(Tone.ESCALATION, ctx(ItemCategory.REFUND, "{{senderName}} $1 \\ {{nope}}"));
        assertThat(l.body()).contains("{{senderName}} $1 \\ {{nope}}");
    }

    @Test
    void renderFailsLoudlyOnUnknownPlaceholder() {
        assertThatThrownBy(() -> LetterTemplateEngine.render("Hi {{who}}", Map.of()))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("who");
        assertThat(LetterTemplateEngine.render("Hi {{who}}!", Map.of("who", "Bob"))).isEqualTo("Hi Bob!");
    }

    @Test
    void sameInputSameOutput() {
        assertThat(engine.draft(Tone.ESCALATION, ctx(ItemCategory.CLAIM, "x")))
                .isEqualTo(engine.draft(Tone.ESCALATION, ctx(ItemCategory.CLAIM, "x")));
    }
}
