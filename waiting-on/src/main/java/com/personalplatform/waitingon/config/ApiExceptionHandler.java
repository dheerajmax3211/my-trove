package com.personalplatform.waitingon.config;

import com.personalplatform.waitingon.item.ItemExceptions.FollowUpUnavailableException;
import com.personalplatform.waitingon.item.ItemExceptions.InvalidStateException;
import com.personalplatform.waitingon.item.ItemExceptions.ItemNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** Consistent RFC 9457 problem responses; validation errors come from the Spring base class. */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger LOG = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ItemNotFoundException.class)
    ProblemDetail notFound(ItemNotFoundException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(InvalidStateException.class)
    ProblemDetail conflict(InvalidStateException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ProblemDetail badRequest(IllegalArgumentException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    @ExceptionHandler(FollowUpUnavailableException.class)
    ProblemDetail unavailable(FollowUpUnavailableException e) {
        LOG.warn("Follow-up engine unavailable: {}", e.getMessage(), e.getCause());
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
                "The follow-up scheduler is temporarily unavailable; nothing was changed. Please retry.");
    }
}
