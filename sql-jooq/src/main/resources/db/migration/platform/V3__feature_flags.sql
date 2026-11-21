-- platform-service: feature flags (Phase 2). Plain tables only (readable by the jOOQ DDL parser); the append-only
-- trigger on flag_audit lives in platform_ext/V103.
--
-- A flag is on for a caller when: enabled, the caller's plan is in allowed_plans (null or empty = any plan), the caller
-- holds one of allowed_roles (null or empty = any role), and hash(uid + ':' + key) mod 100 < rollout_percent.

create table platform.feature_flags (
    key             varchar(64)  primary key check (key ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
    description     varchar(500) not null default '',
    enabled         boolean      not null default false,
    rollout_percent smallint     not null default 100 check (rollout_percent between 0 and 100),
    allowed_plans   text[],
    allowed_roles   text[],
    created_at      timestamptz  not null default now(),
    updated_at      timestamptz  not null default now(),
    updated_by      varchar(128)
);

-- One row per create / update / delete. No foreign key to feature_flags: the trail must outlive a deleted flag.
-- detail holds the flag as it was written (CREATE, UPDATE) or as it was removed (DELETE).
create table platform.flag_audit (
    id       bigint       generated always as identity primary key,
    flag_key varchar(64)  not null,
    action   varchar(16)  not null check (action in ('CREATE', 'UPDATE', 'DELETE')),
    actor    varchar(128) not null,
    at       timestamptz  not null default now(),
    detail   jsonb
);

create index flag_audit_key_at_idx on platform.flag_audit (flag_key, at desc);
