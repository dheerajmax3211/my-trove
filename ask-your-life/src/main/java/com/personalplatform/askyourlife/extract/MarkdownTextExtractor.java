package com.personalplatform.askyourlife.extract;

import java.nio.charset.Charset;
import java.util.regex.Pattern;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Light Markdown to text: drops formatting syntax but keeps the words (and link / image text, and code content).
 * Not a full CommonMark parser, which is fine for search: the goal is that markers like {@code **} or {@code ](}
 * do not pollute the index.
 */
@Component
@Order(0)
public class MarkdownTextExtractor implements TextExtractor {

    private static final Pattern FENCE = Pattern.compile("(?m)^\\s*(```|~~~).*$");
    private static final Pattern IMAGE_OR_LINK = Pattern.compile("!?\\[([^\\]]*)]\\([^)]*\\)");
    private static final Pattern REF_LINK = Pattern.compile("\\[([^\\]]+)]\\[[^\\]]*]");
    private static final Pattern HEADING = Pattern.compile("(?m)^\\s{0,3}#{1,6}\\s+");
    private static final Pattern BLOCKQUOTE = Pattern.compile("(?m)^\\s{0,3}>\\s?");
    private static final Pattern LIST_MARKER = Pattern.compile("(?m)^(\\s*)([-*+]|\\d+[.)])\\s+");
    private static final Pattern RULE = Pattern.compile("(?m)^\\s*([-*_]\\s*){3,}$");
    private static final Pattern EMPHASIS = Pattern.compile("(\\*\\*|__|\\*|_|~~|`)");
    private static final Pattern HTML_TAG = Pattern.compile("<[^>]+>");

    @Override
    public boolean supports(String mimeType) {
        return mimeType.equals("text/markdown") || mimeType.equals("text/x-markdown");
    }

    @Override
    public String extract(byte[] data, Charset charset) {
        String s = new String(data, charset);
        s = FENCE.matcher(s).replaceAll("");
        s = IMAGE_OR_LINK.matcher(s).replaceAll("$1");
        s = REF_LINK.matcher(s).replaceAll("$1");
        s = HEADING.matcher(s).replaceAll("");
        s = BLOCKQUOTE.matcher(s).replaceAll("");
        s = RULE.matcher(s).replaceAll("");
        s = LIST_MARKER.matcher(s).replaceAll("$1");
        s = HTML_TAG.matcher(s).replaceAll(" ");
        s = EMPHASIS.matcher(s).replaceAll("");
        return s;
    }
}
