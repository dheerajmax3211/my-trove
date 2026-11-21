package com.personalplatform.askyourlife.extract;

import java.nio.charset.Charset;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** Fallback for text/plain and any other text/* type that has no dedicated extractor. */
@Component
@Order(Integer.MAX_VALUE)
public class PlainTextExtractor implements TextExtractor {

    @Override
    public boolean supports(String mimeType) {
        return mimeType.startsWith("text/") || mimeType.equals("message/rfc822");
    }

    @Override
    public String extract(byte[] data, Charset charset) {
        return new String(data, charset);
    }
}
