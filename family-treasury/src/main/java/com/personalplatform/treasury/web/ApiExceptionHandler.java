package com.personalplatform.treasury.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** One error shape for the whole API. Spring MVC's own exceptions (validation, missing header...) already map to ProblemDetail. */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemDetail> handle(ApiException e) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(e.status(), e.getMessage());
        pd.setProperty("code", e.code());
        return ResponseEntity.status(e.status()).body(pd);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<ProblemDetail> handleIllegalArgument(IllegalArgumentException e) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
        pd.setProperty("code", "INVALID_REQUEST");
        return ResponseEntity.badRequest().body(pd);
    }

    @ExceptionHandler(ArithmeticException.class)
    ResponseEntity<ProblemDetail> handleOverflow(ArithmeticException e) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "amount out of range");
        pd.setProperty("code", "AMOUNT_OUT_OF_RANGE");
        return ResponseEntity.badRequest().body(pd);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> handleUnexpected(Exception e) {
        log.error("Unhandled error", e);
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "unexpected error");
        pd.setProperty("code", "INTERNAL_ERROR");
        return ResponseEntity.internalServerError().body(pd);
    }
}
