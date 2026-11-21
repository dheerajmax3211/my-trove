package com.personalplatform.askyourlife.search;

import java.util.Locale;

public enum SearchMode {
    HYBRID, KEYWORD, SEMANTIC;

    /** Case-insensitive, so {@code ?mode=hybrid} works. */
    public static SearchMode parse(String s) {
        try {
            return valueOf(s.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("mode must be one of hybrid, keyword, semantic");
        }
    }
}
