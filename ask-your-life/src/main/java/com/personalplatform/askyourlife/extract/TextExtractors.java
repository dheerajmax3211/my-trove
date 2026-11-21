package com.personalplatform.askyourlife.extract;

import java.nio.charset.Charset;
import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Component;

/**
 * Registry: picks the first {@link TextExtractor} that supports the media type (beans are ordered, the plain
 * text fallback last) and normalises the result (NFC, LF line endings, no NULs).
 */
@Component
public class TextExtractors {

    private final List<TextExtractor> extractors;

    public TextExtractors(List<TextExtractor> extractors) {
        this.extractors = List.copyOf(extractors);
    }

    public String extract(String mimeType, byte[] data, Charset charset) {
        String base = baseType(mimeType);
        for (TextExtractor e : extractors) {
            if (e.supports(base)) {
                return normalise(e.extract(data, charset));
            }
        }
        throw new UnsupportedContentException(base);
    }

    public static String baseType(String mimeType) {
        if (mimeType == null || mimeType.isBlank()) {
            return "text/plain";
        }
        int semi = mimeType.indexOf(';');
        String base = semi >= 0 ? mimeType.substring(0, semi) : mimeType;
        return base.strip().toLowerCase(Locale.ROOT);
    }

    static String normalise(String text) {
        String s = text.replace("\r\n", "\n").replace('\r', '\n').replace("\u0000", "");
        return Normalizer.normalize(s, Normalizer.Form.NFC).strip();
    }

    public static class UnsupportedContentException extends RuntimeException {
        public UnsupportedContentException(String mimeType) {
            super("No text extractor is registered for " + mimeType
                    + (mimeType.equals("application/pdf")
                            ? " (PDF extraction is an extension point: register a TextExtractor bean)"
                            : ""));
        }
    }
}
