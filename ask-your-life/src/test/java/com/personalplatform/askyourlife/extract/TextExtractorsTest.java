package com.personalplatform.askyourlife.extract;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;

class TextExtractorsTest {

    private final TextExtractors registry = new TextExtractors(
            List.of(new MarkdownTextExtractor(), new HtmlTextExtractor(), new PlainTextExtractor()));

    private String extract(String mime, String body) {
        return registry.extract(mime, body.getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8);
    }

    @Test
    void plainTextIsKeptButLineEndingsAndUnicodeAreNormalised() {
        assertThat(extract("text/plain", "  a\r\nb\rc  ")).isEqualTo("a\nb\nc");
        assertThat(extract("text/plain; charset=utf-8", "Café")).isEqualTo("Café"); // NFC
        assertThat(extract("text/plain", "nul\u0000byte")).isEqualTo("nulbyte");
    }

    @Test
    void markdownSyntaxIsRemovedButWordsAreKept() {
        String md = """
                # Trip plan

                **Book** the _train_ to [Lisbon](https://example.com/x) and see ![map](m.png).

                - pack `passport`
                1. check visa

                > remember sunscreen

                ```java
                int x = 1;
                ```
                """;
        String text = extract("text/markdown", md);
        assertThat(text).contains("Trip plan", "Book the train to Lisbon and see map.", "pack passport",
                "check visa", "remember sunscreen", "int x = 1;");
        assertThat(text).doesNotContain("#", "**", "](", "```", "https://example.com", "_train_");
    }

    @Test
    void htmlBecomesTextWithoutScriptsStylesTagsOrEntities() {
        String html = "<html><head><title>x</title><style>p{color:red}</style></head><body>"
                + "<h1>Receipt</h1><p>Total: &euro;12.50 &amp; tax</p><script>alert('x')</script>"
                + "<ul><li>Coffee</li><li>Cake</li></ul><!-- hidden --></body></html>";
        String text = extract("text/html", html);
        assertThat(text).contains("Receipt", "Total: €12.50 & tax", "Coffee", "Cake");
        assertThat(text).doesNotContain("<", "alert", "color:red", "hidden", "&amp;", "title");
        assertThat(text.indexOf("Coffee")).isLessThan(text.indexOf("Cake"));
    }

    @Test
    void unknownTextSubtypesFallBackToPlainText() {
        assertThat(extract("text/csv", "a,b\n1,2")).isEqualTo("a,b\n1,2");
    }

    @Test
    void pdfIsADocumentedExtensionPointNotSilentlyIgnored() {
        assertThatThrownBy(() -> extract("application/pdf", "%PDF-1.7"))
                .isInstanceOf(TextExtractors.UnsupportedContentException.class)
                .hasMessageContaining("PDF extraction is an extension point");
    }

    @Test
    void aCustomExtractorBeanTakesPartInSelection() {
        TextExtractor pdf = new TextExtractor() {
            public boolean supports(String m) { return m.equals("application/pdf"); }
            public String extract(byte[] d, java.nio.charset.Charset c) { return "pdf text"; }
        };
        TextExtractors custom = new TextExtractors(List.of(pdf, new PlainTextExtractor()));
        assertThat(custom.extract("application/pdf", new byte[0], StandardCharsets.UTF_8)).isEqualTo("pdf text");
    }

    @Test
    void missingMimeTypeDefaultsToPlainText() {
        assertThat(registry.extract(null, "hi".getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8)).isEqualTo("hi");
    }
}
