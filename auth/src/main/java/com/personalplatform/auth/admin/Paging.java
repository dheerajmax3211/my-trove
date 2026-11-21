package com.personalplatform.auth.admin;

import com.personalplatform.auth.common.ApiException;

final class Paging {

    static final int MAX_SIZE = 100;

    private Paging() {}

    static void validate(int page, int size) {
        if (page < 0) {
            throw ApiException.badRequest("INVALID_PAGING", "page must be 0 or greater");
        }
        if (size < 1 || size > MAX_SIZE) {
            throw ApiException.badRequest("INVALID_PAGING", "size must be between 1 and " + MAX_SIZE);
        }
    }
}
