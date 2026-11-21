package com.personalplatform.askyourlife.chunking;

/** One window of a document. {@code text} is a verbatim slice of the input; {@code tokens} is its token count. */
public record TextChunk(int ordinal, String text, int tokens) {}
