package com.personalplatform.waitingon.inbound;

import java.util.regex.Pattern;
import org.springframework.web.util.HtmlUtils;

/**
 * HTML email body to plain text without a DOM or a new library. Same approach as Ask Your Life's
 * {@code HtmlTextExtractor} (drop script/style/comments, block tags to line breaks, strip tags, decode entities), plus
 * one email-specific step: quoted history inside {@code <blockquote>} (Gmail, Apple Mail, Thunderbird) is removed
 * before conversion. Not a sanitiser; the output is only ever classified and shown as text.
 */
final class HtmlText {

    private static final Pattern DROPPED = Pattern.compile("(?is)<(script|style|head|noscript|title)\\b.*?</\\1\\s*>");
    private static final Pattern COMMENT = Pattern.compile("(?s)<!--.*?-->");
    /** Innermost blockquote first, repeated, so nested quotes go too. */
    private static final Pattern BLOCKQUOTE = Pattern.compile("(?is)<blockquote\\b[^>]*>(?:(?!<blockquote\\b).)*?</blockquote\\s*>");
    private static final Pattern PARAGRAPH_TAG = Pattern.compile(
            "(?i)</?(p|div|section|article|h[1-6]|ul|ol|table|pre|hr)\\b[^>]*>");
    private static final Pattern LINE_TAG = Pattern.compile("(?i)<(br|li|tr)\\b[^>]*>|</(li|tr)\\s*>");
    private static final Pattern ANY_TAG = Pattern.compile("<[^>]*>");
    private static final Pattern SPACES = Pattern.compile("[ \\t\\x0B\\f]+");
    private static final Pattern BLANKS = Pattern.compile("\\n[ ]*(\\n[ ]*)+");
    private static final int MAX_BLOCKQUOTE_PASSES = 20;

    private HtmlText() {
    }

    static String toText(String html) {
        if (html == null) {
            return "";
        }
        String s = COMMENT.matcher(html).replaceAll(" ");
        s = DROPPED.matcher(s).replaceAll(" ");
        for (int i = 0; i < MAX_BLOCKQUOTE_PASSES; i++) {
            String next = BLOCKQUOTE.matcher(s).replaceAll("\n");
            if (next.equals(s)) {
                break;
            }
            s = next;
        }
        s = PARAGRAPH_TAG.matcher(s).replaceAll("\n\n");
        s = LINE_TAG.matcher(s).replaceAll("\n");
        s = ANY_TAG.matcher(s).replaceAll(" ");
        s = HtmlUtils.htmlUnescape(s);
        s = s.replace(' ', ' ');
        s = SPACES.matcher(s).replaceAll(" ");
        s = BLANKS.matcher(s).replaceAll("\n\n");
        return s.lines().map(String::strip).reduce((a, b) -> a + "\n" + b).orElse("").strip();
    }
}
