-- Not read by the jOOQ generator (it only parses db/migration/shared/*.sql); applied by Flyway at runtime
-- via spring.flyway.locations. Version numbers >= 100 are reserved for this location.
create or replace function shared.reject_audit_mutation() returns trigger
    language plpgsql as
$$
begin
    raise exception 'shared.audit_events is append-only: % is not allowed', tg_op
        using errcode = 'restrict_violation';
end;
$$;

create trigger audit_events_no_update_delete
    before update or delete on shared.audit_events
    for each row execute function shared.reject_audit_mutation();

create trigger audit_events_no_truncate
    before truncate on shared.audit_events
    for each statement execute function shared.reject_audit_mutation();
