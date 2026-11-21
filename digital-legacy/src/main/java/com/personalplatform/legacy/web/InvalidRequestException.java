package com.personalplatform.legacy.web;

import java.util.List;

/** 400 with a list of human-readable problems. Messages must never echo secret values. */
public class InvalidRequestException extends RuntimeException {

    private final List<String> problems;

    public InvalidRequestException(String problem) {
        this(List.of(problem));
    }

    public InvalidRequestException(List<String> problems) {
        super(String.join("; ", problems));
        this.problems = List.copyOf(problems);
    }

    public List<String> problems() {
        return problems;
    }
}
