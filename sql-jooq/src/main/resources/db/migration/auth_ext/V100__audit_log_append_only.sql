-- Not read by the jOOQ generator (plpgsql / triggers). Listed in spring.flyway.locations as classpath:db/migration/auth_ext.
create function auth.audit_log_block_mutation() returns trigger
    language plpgsql
as $$
begin
    raise exception 'auth.audit_log is append-only: % is not allowed', tg_op
        using errcode = 'integrity_constraint_violation';
end;
$$;

create trigger audit_log_no_update_delete
    before update or delete on auth.audit_log
    for each row execute function auth.audit_log_block_mutation();

create trigger audit_log_no_truncate
    before truncate on auth.audit_log
    for each statement execute function auth.audit_log_block_mutation();
