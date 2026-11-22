-- platform-service: API keys (W4 item 2). Plain tables only (readable by the jOOQ DDL parser).
--
-- A key is "pk_" + 8 hex characters (key_prefix, unique, used to find the row) + "_" + a random secret. Only the
-- SHA-256 hex digest of the whole key is stored (key_hash). Scopes live in api_key_scopes; each scope maps to
-- permissions in the service's catalogue. last_used_at is written by verification, at most once a minute.

create table platform.api_keys (
    id           uuid         primary key,
    app_id       uuid         not null references platform.developer_apps (id),
    owner_uid    varchar(128) not null,
    name         varchar(80)  not null check (length(btrim(name)) > 0),
    key_prefix   varchar(16)  not null unique,
    key_hash     varchar(64)  not null,
    created_at   timestamptz  not null default now(),
    last_used_at timestamptz,
    expires_at   timestamptz,
    revoked_at   timestamptz
);

create index api_keys_owner_idx on platform.api_keys (owner_uid, created_at);
create index api_keys_app_idx on platform.api_keys (app_id, created_at);

create table platform.api_key_scopes (
    key_id uuid        not null references platform.api_keys (id) on delete cascade,
    scope  varchar(64) not null,
    primary key (key_id, scope)
);
