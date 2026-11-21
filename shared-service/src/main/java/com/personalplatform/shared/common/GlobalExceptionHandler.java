package com.personalplatform.shared.common;

import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** One error shape for the whole API: RFC 9457 ProblemDetail. Spring's own MVC errors are already mapped by the base class. */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemDetail> handleApi(ApiException e) {
        return ResponseEntity.status(e.status()).body(ProblemDetail.forStatusAndDetail(e.status(), e.getMessage()));
    }
}
