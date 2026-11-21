package com.personalplatform.askyourlife.rls;

import com.personalplatform.askyourlife.config.RlsProperties;
import java.util.function.Function;
import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Binds a database transaction to one owner so Postgres row-level security can isolate tenants.
 *
 * <p>Every repository call goes through {@link #call}. It opens (or joins) a transaction and, once per
 * transaction, runs {@code SET LOCAL ROLE <non-superuser role>} and {@code set_config('app.owner_uid', uid, true)}.
 * Both are transaction-local, so a pooled connection never carries an owner into the next request. The RLS policies
 * compare {@code owner_uid} to that setting; with no owner set they match nothing (fail closed).
 *
 * <p>A transaction serves exactly one owner: asking for a second, different owner inside it is a programming error
 * and throws instead of silently crossing tenants.
 */
@Component
public class OwnerScope {

    /** Marker for "role switched, no owner": user-data tables are invisible, queue tables are usable. */
    private static final String NO_OWNER = "\u0000";
    private static final Object BOUND_KEY = new Object();

    private final DSLContext dsl;
    private final TransactionTemplate tx;
    private final String role;

    public OwnerScope(DSLContext dsl, PlatformTransactionManager txManager, RlsProperties props) {
        this.dsl = dsl;
        this.tx = new TransactionTemplate(txManager);
        String r = props.role();
        if (r != null && !r.isBlank() && !r.matches("[a-z_][a-z0-9_]*")) {
            throw new IllegalArgumentException("app.rls.role must be a plain lower-case identifier");
        }
        this.role = r == null || r.isBlank() ? null : r;
    }

    /** Runs {@code work} in a transaction scoped to {@code ownerUid}. */
    public <T> T call(String ownerUid, Function<DSLContext, T> work) {
        if (ownerUid == null || ownerUid.isBlank()) {
            throw new IllegalArgumentException("ownerUid is required");
        }
        return tx.execute(status -> {
            bind(ownerUid);
            return work.apply(dsl);
        });
    }

    public void run(String ownerUid, java.util.function.Consumer<DSLContext> work) {
        call(ownerUid, d -> {
            work.accept(d);
            return null;
        });
    }

    /**
     * Runs {@code work} as the restricted role but with no owner: documents and chunks are invisible, the job
     * queue (which has no RLS) is usable. For the ingestion worker's claim / complete bookkeeping.
     */
    public <T> T callWithoutOwner(Function<DSLContext, T> work) {
        return tx.execute(status -> {
            bind(NO_OWNER);
            return work.apply(dsl);
        });
    }

    @SuppressWarnings("unchecked")
    private void bind(String owner) {
        String bound = (String) TransactionSynchronizationManager.getResource(BOUND_KEY);
        if (bound != null) {
            if (bound.equals(owner) || owner.equals(NO_OWNER)) {
                return;
            }
            if (!bound.equals(NO_OWNER)) {
                throw new IllegalStateException("transaction is already scoped to a different owner");
            }
            TransactionSynchronizationManager.unbindResource(BOUND_KEY);
        }
        if (bound == null) {
            if (role != null) {
                dsl.execute("set local role {0}", DSL.name(role));
            }
        }
        if (!owner.equals(NO_OWNER)) {
            dsl.fetch("select set_config('app.owner_uid', ?, true)", owner);
        }
        TransactionSynchronizationManager.bindResource(BOUND_KEY, owner);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (TransactionSynchronizationManager.hasResource(BOUND_KEY)) {
                    TransactionSynchronizationManager.unbindResource(BOUND_KEY);
                }
            }
        });
    }
}
