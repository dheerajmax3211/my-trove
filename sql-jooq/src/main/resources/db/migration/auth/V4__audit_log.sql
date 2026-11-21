-- Append-only record of role changes, suspensions and plan changes (the immutability trigger is in auth_ext).
-- actor_id / target_id are deliberately not foreign keys: the record must outlive any user row.
create table auth.audit_log (
    id        uuid                     primary key,
    at        timestamp with time zone not null default now(),
    actor_id  uuid,
    action    varchar(64)              not null,
    target_id uuid,
    detail    jsonb                    not null default '{}'::jsonb
);

create index audit_log_at_idx on auth.audit_log (at desc);
create index audit_log_target_idx on auth.audit_log (target_id, at desc);
