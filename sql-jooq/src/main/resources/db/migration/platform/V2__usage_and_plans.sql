-- platform-service: plans (seed limits the gateway enforces) and the raw usage events the gateway publishes to Kafka.
-- Plain tables only (readable by the jOOQ DDL parser). usage_events becomes a TimescaleDB hypertable, with its
-- continuous aggregates and policies, in platform_ext/V100+ (Flyway applies both locations through one history table).

create table platform.plans (
    name                varchar(32) primary key,
    requests_per_minute integer     not null check (requests_per_minute > 0),
    requests_per_month  bigint      not null check (requests_per_month > 0),
    max_api_keys        integer     not null check (max_api_keys >= 0),
    max_webhooks        integer     not null check (max_webhooks >= 0)
);

insert into platform.plans (name, requests_per_minute, requests_per_month, max_api_keys, max_webhooks) values
    ('FREE',        120,    10000,  3,  1),
    ('PRO',         600,   200000, 10,  5),
    ('DEVELOPER',  1200,  1000000, 50, 20);

-- One row per proxied request (design 5.4). Idempotent on (event_id, ts): a hypertable's unique key must contain the
-- partitioning column, and a redelivered Kafka record carries the same ts, so the pair is as unique as event_id.
-- principal_id is text: the platform token's uid claim for USER, the key / client id otherwise, anon:<hash> for ANON.
create table platform.usage_events (
    event_id       uuid         not null,
    ts             timestamptz  not null,
    request_id     varchar(128),
    principal_type varchar(16)  not null check (principal_type in ('USER', 'API_KEY', 'CONSENT_CLIENT', 'ANON')),
    principal_id   varchar(128) not null,
    app_id         varchar(128),
    service        varchar(64)  not null,
    method         varchar(16)  not null,
    route_template varchar(256) not null,
    status         smallint     not null check (status between 100 and 599),
    latency_ms     integer      not null check (latency_ms >= 0),
    request_bytes  bigint       not null default 0,
    response_bytes bigint       not null default 0,
    plan           varchar(32),
    rate_limited   boolean      not null default false,
    ingested_at    timestamptz  not null default now(),
    primary key (event_id, ts)
);

create index usage_events_principal_ts_idx on platform.usage_events (principal_id, ts desc);
