package com.personalplatform.askyourlife.web;

import com.personalplatform.askyourlife.extract.TextExtractors;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** Consistent ProblemDetail responses. Spring's own MVC exceptions (validation, bad JSON, ...) are already handled. */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(ApiException.class)
    ResponseEntity<Object> handleApi(ApiException e, WebRequest request) {
        return handleExceptionInternal(e, ProblemDetail.forStatusAndDetail(e.status(), e.getMessage()),
                new HttpHeaders(), e.status(), request);
    }

    @ExceptionHandler(TextExtractors.UnsupportedContentException.class)
    ResponseEntity<Object> handleUnsupported(TextExtractors.UnsupportedContentException e, WebRequest request) {
        return handleExceptionInternal(e,
                ProblemDetail.forStatusAndDetail(HttpStatus.UNSUPPORTED_MEDIA_TYPE, e.getMessage()),
                new HttpHeaders(), HttpStatus.UNSUPPORTED_MEDIA_TYPE, request);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<Object> handleIllegalArgument(IllegalArgumentException e, WebRequest request) {
        return handleExceptionInternal(e, ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage()),
                new HttpHeaders(), HttpStatus.BAD_REQUEST, request);
    }
}
