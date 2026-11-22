-- platform-service: developer apps (W4 item 1). Plain tables only (readable by the jOOQ DDL parser).
--
-- An app is owned by the developer's internal user id (the platform token's uid claim). Its client secret is generated
-- once and shown once; only its SHA-256 hex digest is stored (client_secret_hash, null after a revoke). Deleting an app
-- sets revoked_at: the row stays so its API keys and webhook deliveries keep a readable history.

create table platform.developer_apps (
    id                   uuid         primary key,
    owner_uid            varchar(128) not null,
    name                 varchar(80)  not null check (length(btrim(name)) > 0),
    description          varchar(500) not null default '',
    client_id            varchar(64)  not null unique,
    client_secret_hash   varchar(64),
    secret_rotated_at    timestamptz,
    created_at           timestamptz  not null default now(),
    updated_at           timestamptz  not null default now(),
    revoked_at           timestamptz
);

create index developer_apps_owner_idx on platform.developer_apps (owner_uid, created_at);

-- Allowed OAuth redirect targets, exact match. https, or http only for localhost (checked by the service).
create table platform.developer_app_redirect_uris (
    app_id  uuid          not null references platform.developer_apps (id) on delete cascade,
    uri     varchar(2048) not null,
    primary key (app_id, uri)
);
