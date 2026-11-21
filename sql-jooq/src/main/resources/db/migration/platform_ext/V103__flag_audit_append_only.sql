-- Not read by the jOOQ generator (plpgsql / triggers). Same pattern as auth_ext/V100 for auth.audit_log.
create function platform.flag_audit_block_mutation() returns trigger
    language plpgsql
as $$
begin
    raise exception 'platform.flag_audit is append-only: % is not allowed', tg_op
        using errcode = 'integrity_constraint_violation';
end;
$$;

create trigger flag_audit_no_update_delete
    before update or delete on platform.flag_audit
    for each row execute function platform.flag_audit_block_mutation();

create trigger flag_audit_no_truncate
    before truncate on platform.flag_audit
    for each statement execute function platform.flag_audit_block_mutation();
