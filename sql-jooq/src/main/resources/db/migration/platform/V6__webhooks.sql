-- platform-service: webhooks (W4 item 4). Plain tables only (readable by the jOOQ DDL parser).
--
-- An endpoint belongs to one developer app and receives the domain events of its owner that it subscribes to. Its
-- signing secret is returned once, on create and on rotate; it is stored in full because every delivery must be signed
-- with it (a hash cannot sign). Disabling an endpoint sets disabled_at; its delivery log stays readable.
--
-- webhook_received_events makes fan-out idempotent: Kafka delivers at least once, and an (endpoint, event) pair is
-- enqueued at most once. webhook_deliveries is the delivery log: one row per attempt chain, PENDING until delivered
-- (DELIVERED) or until the retry schedule is exhausted (DEAD). A replay is a new row pointing at the original.

create table platform.webhook_endpoints (
    id          uuid          primary key,
    app_id      uuid          not null references platform.developer_apps (id),
    owner_uid   varchar(128)  not null,
    url         varchar(2048) not null,
    description varchar(200)  not null default '',
    secret      varchar(80)   not null,
    created_at  timestamptz   not null default now(),
    updated_at  timestamptz   not null default now(),
    disabled_at timestamptz
);

create index webhook_endpoints_owner_idx on platform.webhook_endpoints (owner_uid, created_at);
create index webhook_endpoints_app_idx on platform.webhook_endpoints (app_id, created_at);

create table platform.webhook_endpoint_events (
    endpoint_id uuid        not null references platform.webhook_endpoints (id) on delete cascade,
    event_type  varchar(64) not null,
    primary key (endpoint_id, event_type)
);

create table platform.webhook_received_events (
    endpoint_id uuid        not null references platform.webhook_endpoints (id) on delete cascade,
    event_id    uuid        not null,
    received_at timestamptz not null default now(),
    primary key (endpoint_id, event_id)
);

create table platform.webhook_deliveries (
    id               uuid         primary key,
    endpoint_id      uuid         not null references platform.webhook_endpoints (id) on delete cascade,
    event_id         uuid         not null,
    event_type       varchar(64)  not null,
    payload          text         not null,
    status           varchar(16)  not null check (status in ('PENDING', 'DELIVERED', 'DEAD')),
    attempts         integer      not null default 0 check (attempts >= 0),
    next_attempt_at  timestamptz,
    last_status_code integer,
    last_error       varchar(500),
    created_at       timestamptz  not null default now(),
    delivered_at     timestamptz,
    replay_of        uuid         references platform.webhook_deliveries (id)
);

create index webhook_deliveries_due_idx on platform.webhook_deliveries (status, next_attempt_at);
create index webhook_deliveries_endpoint_idx on platform.webhook_deliveries (endpoint_id, created_at);
