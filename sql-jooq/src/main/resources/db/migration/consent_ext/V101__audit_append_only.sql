-- Not read by the jOOQ generator (plpgsql / triggers). Listed in spring.flyway.locations as classpath:db/migration/consent_ext.
create function consent.audit_log_block_mutation() returns trigger
    language plpgsql
as $$
begin
    raise exception 'consent.audit_log is append-only: % is not allowed', tg_op
        using errcode = 'integrity_constraint_violation';
end;
$$;

create trigger audit_log_no_update_delete
    before update or delete on consent.audit_log
    for each row execute function consent.audit_log_block_mutation();

create trigger audit_log_no_truncate
    before truncate on consent.audit_log
    for each statement execute function consent.audit_log_block_mutation();
