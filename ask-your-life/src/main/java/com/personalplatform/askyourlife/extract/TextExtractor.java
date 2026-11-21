package com.personalplatform.askyourlife.extract;

import java.nio.charset.Charset;

/**
 * Extension point: turns raw bytes of one kind of content into plain text.
 *
 * <p>To add PDF support, implement this interface (for example with Apache PDFBox'
 * {@code Loader.loadPDF(bytes)} + {@code PDFTextStripper}) for {@code application/pdf} and register it as a Spring
 * bean; {@link TextExtractors} picks up every {@code TextExtractor} bean. Scanned documents would additionally
 * need OCR, which is out of scope here.
 */
public interface TextExtractor {

    /** Whether this extractor handles the given media type (lower-case, without parameters). */
    boolean supports(String mimeType);

    /** Returns the plain text of {@code data}. */
    String extract(byte[] data, Charset charset);
}
