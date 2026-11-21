-- digital-legacy: dead-man's switch for end-to-end encrypted vaults.
-- The server stores ciphertext and sealed (encrypted-to-trustee) key shares only; it never holds a key.
create schema if not exists legacy;

create table legacy.vaults (
    id                 uuid primary key,
    owner_uid          varchar(128) not null,
    -- opaque client-side AES-256-GCM ciphertext and its client-supplied, server-validated parameters
    ciphertext         bytea        not null,
    ciphertext_sha256  bytea        not null,
    metadata           jsonb        not null,
    vault_version      integer      not null default 1,
    content_revision   integer      not null default 1,
    -- protocol state
    state              varchar(20)  not null default 'ACTIVE',
    armed              boolean      not null default false,
    epoch              integer      not null default 0,
    policy             jsonb,
    last_checkin_at    timestamptz,
    next_due_at        timestamptz,
    state_entered_at   timestamptz,
    steps_executed     integer      not null default 0,
    quorum_reached_at  timestamptz,
    paused_until       timestamptz,
    pause_window_start timestamptz,
    pause_used_seconds bigint       not null default 0,
    -- durable timer: the scheduler claims rows whose next_action_at has passed
    next_action_at     timestamptz,
    released_at        timestamptz,
    created_at         timestamptz  not null default now(),
    updated_at         timestamptz  not null default now(),
    constraint vaults_owner_uk unique (owner_uid),
    constraint vaults_state_ck check (state in ('ACTIVE', 'GRACE', 'ESCALATING', 'RELEASE_PENDING', 'RELEASED')),
    constraint vaults_armed_ck check (not armed or policy is not null),
    constraint vaults_ciphertext_ck check (octet_length(ciphertext) > 0)
);

create index vaults_next_action_ix on legacy.vaults (next_action_at);

create table legacy.trustees (
    id                  uuid primary key,
    vault_id            uuid         not null references legacy.vaults (id),
    label               varchar(100) not null,
    status              varchar(20)  not null default 'INVITED',
    -- only hex SHA-256 digests of the single-use invite token and of the long-lived access token are stored
    invite_token_hash   varchar(64)  not null,
    invite_expires_at   timestamptz  not null,
    invite_used_at      timestamptz,
    access_token_hash   varchar(64),
    key_algorithm       varchar(20),
    public_key          bytea,
    key_fingerprint     varchar(64),
    contacts            jsonb,
    -- JSON envelope sealed to public_key by the owner's client; opaque to the server
    sealed_share        text,
    share_sha256        bytea,
    share_vault_version integer,
    share_uploaded_at   timestamptz,
    share_confirmed_at  timestamptz,
    accepted_at         timestamptz,
    revoked_at          timestamptz,
    created_at          timestamptz  not null default now(),
    constraint trustees_invite_token_uk unique (invite_token_hash),
    constraint trustees_access_token_uk unique (access_token_hash),
    constraint trustees_status_ck check (status in ('INVITED', 'ACCEPTED', 'SHARE_UPLOADED', 'CONFIRMED', 'REVOKED'))
);

create index trustees_vault_ix on legacy.trustees (vault_id);

create table legacy.approvals (
    id         uuid primary key,
    vault_id   uuid        not null references legacy.vaults (id),
    epoch      integer     not null,
    trustee_id uuid        not null references legacy.trustees (id),
    decision   varchar(10) not null,
    decided_at timestamptz not null,
    constraint approvals_decision_ck check (decision in ('APPROVE', 'DECLINE')),
    -- one vote per trustee per incident: duplicate approvals cannot inflate the quorum
    constraint approvals_vote_uk unique (vault_id, epoch, trustee_id)
);

-- escalation steps are recorded exactly once per (vault, incident, step)
create table legacy.escalation_steps (
    vault_id    uuid        not null references legacy.vaults (id),
    epoch       integer     not null,
    step_index  integer     not null,
    executed_at timestamptz not null,
    primary key (vault_id, epoch, step_index)
);

-- transactional outbox: written in the same transaction as the state change, sent afterwards (at-least-once)
create table legacy.notification_outbox (
    id              uuid primary key,
    vault_id        uuid         not null references legacy.vaults (id),
    epoch           integer      not null,
    step_index      integer      not null,
    recipient_kind  varchar(10)  not null,
    recipient_key   varchar(128) not null,
    kind            varchar(30)  not null,
    urgency         varchar(10)  not null,
    contacts        jsonb        not null,
    status          varchar(10)  not null default 'PENDING',
    attempts        integer      not null default 0,
    next_attempt_at timestamptz  not null,
    channel_used    varchar(10),
    delivered_at    timestamptz,
    last_error      varchar(200),
    created_at      timestamptz  not null default now(),
    constraint outbox_status_ck check (status in ('PENDING', 'SENT', 'FAILED')),
    constraint outbox_once_uk unique (vault_id, epoch, step_index, recipient_kind, recipient_key)
);

create index outbox_pending_ix on legacy.notification_outbox (status, next_attempt_at);

-- append-only, hash-chained audit trail; vault_seq / prev_hash / hash are filled by a trigger (see legacy_ext)
create table legacy.audit_log (
    id         uuid primary key,
    vault_id   uuid         not null,
    vault_seq  bigint       not null,
    at         timestamptz  not null,
    actor_kind varchar(10)  not null,
    actor_id   varchar(128) not null,
    event_type varchar(40)  not null,
    detail     jsonb        not null default '{}'::jsonb,
    prev_hash  bytea        not null,
    hash       bytea        not null,
    constraint audit_log_seq_uk unique (vault_id, vault_seq)
);
