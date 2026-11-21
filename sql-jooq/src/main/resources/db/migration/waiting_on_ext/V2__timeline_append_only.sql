-- Not read by the jOOQ generator (plpgsql is outside what its DDL parser understands).
-- Makes waiting_on.item_events append-only at the database level: no UPDATE, DELETE or TRUNCATE, even for the app role.
create or replace function waiting_on.forbid_event_mutation() returns trigger
    language plpgsql as
$$
begin
    raise exception 'waiting_on.item_events is append-only (% not allowed)', tg_op
        using errcode = 'restrict_violation';
end;
$$;

create trigger item_events_no_update_delete
    before update or delete on waiting_on.item_events
    for each row execute function waiting_on.forbid_event_mutation();

create trigger item_events_no_truncate
    before truncate on waiting_on.item_events
    for each statement execute function waiting_on.forbid_event_mutation();
