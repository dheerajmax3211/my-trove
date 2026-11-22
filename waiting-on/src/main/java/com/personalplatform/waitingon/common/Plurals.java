package com.personalplatform.waitingon.common;

/** Words that follow a count. Used everywhere a number of days reaches a person: letters, timeline text, errors. */
public final class Plurals {

    private Plurals() {}

    /** "1 day", "0 days", "21 days". */
    public static String days(long n) {
        return n + (n == 1 ? " day" : " days");
    }
}
