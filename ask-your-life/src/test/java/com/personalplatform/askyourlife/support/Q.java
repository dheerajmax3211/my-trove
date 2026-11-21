package com.personalplatform.askyourlife.support;

import java.util.List;
import org.jooq.DSLContext;

/** Tiny plain-SQL helpers for assertions. */
public final class Q {

    private Q() {}

    public static <T> T val(DSLContext dsl, String sql, Class<T> type, Object... binds) {
        return dsl.resultQuery(sql, binds).fetchOne(0, type);
    }

    public static <T> List<T> vals(DSLContext dsl, String sql, Class<T> type, Object... binds) {
        return dsl.resultQuery(sql, binds).fetch(0, type);
    }
}
