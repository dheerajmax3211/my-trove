create schema if not exists consent;

-- RSA signing keys for gateway-issued JWTs. The private key is stored encrypted (AES-256-GCM) and never in plaintext.
create table consent.signing_keys (
    kid             varchar(64)              primary key,
    algorithm       varchar(16)              not null,
    status          varchar(16)              not null check (status in ('ACTIVE', 'RETIRED')),
    public_jwk      text                     not null,
    private_key_enc bytea                    not null,
    enc_alg         varchar(32)              not null,
    created_at      timestamp with time zone not null,
    retired_at      timestamp with time zone,
    verify_until    timestamp with time zone
);

-- The vault: one row per attribute, scoped to the owner (Firebase uid).
create table consent.attributes (
    id          uuid                     primary key,
    owner_uid   varchar(128)             not null,
    key_path    varchar(255)             not null,
    value       jsonb                    not null,
    sensitivity varchar(16)              not null check (sensitivity in ('PUBLIC', 'PERSONAL', 'SENSITIVE', 'RESTRICTED')),
    created_at  timestamp with time zone not null,
    updated_at  timestamp with time zone not null,
    unique (owner_uid, key_path)
);

-- Third-party apps registered by an owner. client_id is public; the secret is stored only as a KDF hash.
create table consent.clients (
    id                uuid                     primary key,
    client_id         varchar(64)              not null unique,
    owner_uid         varchar(128)             not null,
    name              varchar(120)             not null,
    contact_email     varchar(320),
    redirect_uri      varchar(1000),
    allowed_scopes    text[]                   not null,
    secret_hash       varchar(255)             not null,
    created_at        timestamp with time zone not null,
    secret_rotated_at timestamp with time zone,
    disabled_at       timestamp with time zone
);
create index clients_owner_idx on consent.clients (owner_uid);

-- What a client asks for. The owner approves (optionally narrowing) or denies.
create table consent.access_requests (
    id                uuid                     primary key,
    owner_uid         varchar(128)             not null,
    client_pk         uuid                     not null references consent.clients (id),
    scopes            text[]                   not null,
    purpose           varchar(500)             not null,
    duration_seconds  integer                  not null,
    max_reads         integer,
    window_start_hour smallint,
    window_end_hour   smallint,
    window_zone       varchar(64),
    status            varchar(16)              not null check (status in ('PENDING', 'APPROVED', 'DENIED')),
    created_at        timestamp with time zone not null,
    decided_at        timestamp with time zone,
    decision_note     varchar(500)
);
create index access_requests_owner_idx on consent.access_requests (owner_uid, status);
create index access_requests_client_idx on consent.access_requests (client_pk);

-- An approved request. The policy engine evaluates exactly these columns on every read.
create table consent.grants (
    id                uuid                     primary key,
    request_id        uuid                     not null unique references consent.access_requests (id),
    owner_uid         varchar(128)             not null,
    client_pk         uuid                     not null references consent.clients (id),
    scopes            text[]                   not null,
    purpose           varchar(500)             not null,
    max_sensitivity   varchar(16)              not null check (max_sensitivity in ('PUBLIC', 'PERSONAL', 'SENSITIVE', 'RESTRICTED')),
    created_at        timestamp with time zone not null,
    expires_at        timestamp with time zone not null,
    max_reads         integer,
    reads_used        integer                  not null default 0,
    window_start_hour smallint,
    window_end_hour   smallint,
    window_zone       varchar(64),
    revoked_at        timestamp with time zone,
    last_read_at      timestamp with time zone
);
create index grants_owner_idx on consent.grants (owner_uid);
create index grants_client_idx on consent.grants (client_pk);

-- Every token the gateway signs, so tokens can be revoked and introspected.
create table consent.issued_tokens (
    jti        uuid                     primary key,
    client_pk  uuid                     not null references consent.clients (id),
    grant_id   uuid                     references consent.grants (id),
    token_use  varchar(16)              not null check (token_use in ('client', 'access')),
    kid        varchar(64)              not null,
    issued_at  timestamp with time zone not null,
    expires_at timestamp with time zone not null,
    revoked_at timestamp with time zone
);
create index issued_tokens_grant_idx on consent.issued_tokens (grant_id);

-- Hash-chained, append-only audit log: one chain per owner. The append-only trigger lives in consent_ext.
create table consent.audit_log (
    owner_uid   varchar(128)             not null,
    owner_seq   bigint                   not null,
    event_type  varchar(48)              not null,
    actor_type  varchar(16)              not null,
    actor_id    varchar(128)             not null,
    client_id   varchar(64),
    grant_id    uuid,
    detail      text                     not null,
    occurred_at timestamp with time zone not null,
    prev_hash   varchar(64)              not null,
    entry_hash  varchar(64)              not null unique,
    primary key (owner_uid, owner_seq)
);

-- Latest chain position per owner; also serialises concurrent appends (row lock) and exposes tail truncation.
create table consent.audit_heads (
    owner_uid varchar(128) primary key,
    last_seq  bigint       not null,
    last_hash varchar(64)  not null
);
