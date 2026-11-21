package com.personalplatform.askyourlife.extract;

import java.nio.charset.Charset;
import java.util.regex.Pattern;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

/**
 * HTML to text without a DOM: removes script/style/comments, turns block-level tags into paragraph or line
 * breaks, strips remaining tags and decodes entities. Adequate for emails and saved web clippings; it is not a
 * sanitiser and is never used to produce HTML (snippets are escaped separately at query time).
 */
@Component
@Order(0)
public class HtmlTextExtractor implements TextExtractor {

    private static final Pattern DROPPED = Pattern.compile("(?is)<(script|style|head|noscript)\\b.*?</\\1\\s*>");
    private static final Pattern COMMENT = Pattern.compile("(?s)<!--.*?-->");
    private static final Pattern PARAGRAPH_TAG = Pattern.compile("(?i)</?(p|div|section|article|h[1-6]|ul|ol|table|blockquote|pre)\\b[^>]*>");
    private static final Pattern LINE_TAG = Pattern.compile("(?i)<(br|li|tr)\\b[^>]*>|</(li|tr)\\s*>");
    private static final Pattern ANY_TAG = Pattern.compile("<[^>]*>");
    private static final Pattern SPACES = Pattern.compile("[ \\t\\x0B\\f]+");
    private static final Pattern BLANKS = Pattern.compile("\\n[ ]*(\\n[ ]*)+");

    @Override
    public boolean supports(String mimeType) {
        return mimeType.equals("text/html") || mimeType.equals("application/xhtml+xml");
    }

    @Override
    public String extract(byte[] data, Charset charset) {
        String s = new String(data, charset);
        s = COMMENT.matcher(s).replaceAll(" ");
        s = DROPPED.matcher(s).replaceAll(" ");
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
