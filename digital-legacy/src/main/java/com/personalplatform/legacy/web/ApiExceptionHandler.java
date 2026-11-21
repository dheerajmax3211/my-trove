package com.personalplatform.legacy.web;

import com.personalplatform.legacy.protocol.ProtocolException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** One consistent ProblemDetail shape for every error. Messages never contain request bodies. */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    ProblemDetail notFound(NotFoundException e) {
        return problem(HttpStatus.NOT_FOUND, "Not found", e.getMessage());
    }

    @ExceptionHandler({ConflictException.class, ProtocolException.class})
    ProblemDetail conflict(RuntimeException e) {
        return problem(HttpStatus.CONFLICT, "Not allowed in the current state", e.getMessage());
    }

    @ExceptionHandler(DuplicateKeyException.class)
    ProblemDetail duplicate(DuplicateKeyException e) {
        return problem(HttpStatus.CONFLICT, "Conflict", "The resource already exists");
    }

    @ExceptionHandler(InvalidRequestException.class)
    ProblemDetail invalid(InvalidRequestException e) {
        ProblemDetail pd = problem(HttpStatus.BAD_REQUEST, "Invalid request", e.getMessage());
        pd.setProperty("problems", e.problems());
        return pd;
    }

    private static ProblemDetail problem(HttpStatus status, String title, String detail) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(status, detail);
        pd.setTitle(title);
        return pd;
    }
}
