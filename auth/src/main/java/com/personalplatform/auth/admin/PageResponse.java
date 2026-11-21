package com.personalplatform.auth.admin;

import java.util.List;

/** A page of results: {@code items} plus where it sits in the {@code total} matches. */
public record PageResponse<T>(List<T> items, int page, int size, long total) {}
