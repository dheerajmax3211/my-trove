-- home-pulse: plain tables only (parseable by the jOOQ DDLDatabase generator).
-- TimescaleDB-specific statements (hypertable, continuous aggregates, policies) live in the
-- separate Flyway location db/migration/home_pulse_ext (V100+), which the generator never reads.
create schema if not exists home_pulse;

create table home_pulse.appliances (
    id                 uuid         primary key,
    owner_uid          varchar(128) not null,
    name               varchar(120) not null,
    type               varchar(32)  not null
        check (type in ('FRIDGE', 'AIR_CONDITIONER', 'WATER_PUMP', 'WASHING_MACHINE', 'OTHER')),
    location           varchar(120),
    purchase_date      date,
    warranty_end_date  date,
    last_service_date  date,
    next_service_date  date,
    notes              varchar(2000),
    created_at         timestamptz  not null default now(),
    updated_at         timestamptz  not null default now()
);
create index appliances_owner_idx on home_pulse.appliances (owner_uid, name);

create table home_pulse.devices (
    id             uuid         primary key,
    owner_uid      varchar(128) not null,
    appliance_id   uuid         not null references home_pulse.appliances (id) on delete cascade,
    label          varchar(120) not null,
    token_hash     char(64)     not null,
    token_prefix   varchar(16)  not null,
    created_at     timestamptz  not null default now(),
    last_seen_at   timestamptz,
    revoked_at     timestamptz
);
-- ingestion tokens are looked up by their SHA-256 hash
create unique index devices_token_hash_uq on home_pulse.devices (token_hash);
-- at most one live device per appliance (rotate = revoke + register)
create unique index devices_one_active_per_appliance_uq on home_pulse.devices (appliance_id) where revoked_at is null;
create index devices_owner_idx on home_pulse.devices (owner_uid);

-- Raw high-frequency readings. Plain table here so jOOQ can generate a typed class for it;
-- V100 (ext location) converts it into a TimescaleDB hypertable partitioned on ts.
-- No FK to devices on purpose: a hypertable FK costs on every insert and device rows are soft-revoked anyway.
-- The primary key doubles as the idempotency key (a hypertable unique index must contain the time column).
create table home_pulse.readings (
    device_id  uuid             not null,
    ts         timestamptz      not null,
    watts      double precision not null check (watts >= 0),
    volts      double precision,
    amps       double precision,
    primary key (device_id, ts)
);

-- Learned "normal electrical signature" of an appliance (robust statistics, see AnomalyDetector).
create table home_pulse.baselines (
    appliance_id  uuid        primary key references home_pulse.appliances (id) on delete cascade,
    status        varchar(16) not null check (status in ('LEARNING', 'READY')),
    learn_from    timestamptz not null,
    learned_at    timestamptz,
    stats         jsonb,
    updated_at    timestamptz not null default now()
);

create table home_pulse.alerts (
    id            uuid         primary key,
    owner_uid     varchar(128) not null,
    appliance_id  uuid         not null references home_pulse.appliances (id) on delete cascade,
    kind          varchar(32)  not null
        check (kind in ('POWER_SHIFT', 'DUTY_CYCLE_DRIFT', 'STUCK_ON', 'STOPPED', 'NO_DATA')),
    severity      varchar(16)  not null check (severity in ('INFO', 'WARNING', 'CRITICAL')),
    status        varchar(16)  not null check (status in ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
    message       varchar(500) not null,
    evidence      jsonb        not null,
    clear_streak  integer      not null default 0,
    opened_at     timestamptz  not null,
    updated_at    timestamptz  not null,
    acknowledged_at timestamptz,
    resolved_at   timestamptz
);
-- dedup guarantee in the database: one live alert per appliance and kind
create unique index alerts_one_active_per_kind_uq on home_pulse.alerts (appliance_id, kind)
    where status in ('OPEN', 'ACKNOWLEDGED');
create index alerts_owner_status_idx on home_pulse.alerts (owner_uid, status, opened_at desc);
