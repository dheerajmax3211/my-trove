package com.personalplatform.consent.common;

import org.springframework.http.HttpStatus;

/** Business-rule failure mapped to a ProblemDetail with a stable machine-readable {@code code}. */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public static ApiException notFound(String what) {
        return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", what + " not found");
    }

    public static ApiException badRequest(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message);
    }

    public static ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }
}
