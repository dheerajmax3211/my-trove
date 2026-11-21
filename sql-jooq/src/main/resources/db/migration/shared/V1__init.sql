-- shared-service schema: households, reminders + notification outbox, file metadata, audit log.
-- Kept free of plpgsql/triggers so jOOQ's DDL parser can read it; those live in db/migration/shared_ext.
create schema if not exists shared;

create table shared.households (
    id         uuid                     primary key,
    name       varchar(200)             not null,
    created_by varchar(128)             not null,
    created_at timestamp with time zone not null
);

create table shared.household_members (
    household_id uuid                     not null references shared.households (id) on delete cascade,
    member_uid   varchar(128)             not null,
    role         varchar(16)              not null check (role in ('OWNER', 'MEMBER')),
    joined_at    timestamp with time zone not null,
    primary key (household_id, member_uid)
);
create index idx_household_members_uid on shared.household_members (member_uid);

-- Only the SHA-256 of an invite code is stored; the plaintext code is shown once at creation.
create table shared.household_invites (
    id           uuid                     primary key,
    household_id uuid                     not null references shared.households (id) on delete cascade,
    code_hash    varchar(64)              not null unique,
    role         varchar(16)              not null check (role in ('OWNER', 'MEMBER')),
    created_by   varchar(128)             not null,
    created_at   timestamp with time zone not null,
    expires_at   timestamp with time zone not null,
    used_at      timestamp with time zone,
    used_by      varchar(128)
);
create index idx_household_invites_household on shared.household_invites (household_id);

create table shared.reminders (
    id                  uuid                     primary key,
    owner_uid           varchar(128)             not null,
    household_id        uuid                     references shared.households (id) on delete cascade,
    title               varchar(300)             not null,
    due_at              timestamp with time zone not null,
    anchor_at           timestamp with time zone not null,
    recurrence          varchar(16)              check (recurrence in ('DAILY', 'WEEKLY', 'MONTHLY')),
    recurrence_interval integer                  not null default 1 check (recurrence_interval >= 1),
    status              varchar(16)              not null default 'ACTIVE' check (status in ('ACTIVE', 'COMPLETED', 'CANCELLED')),
    last_fired_at       timestamp with time zone,
    created_at          timestamp with time zone not null,
    updated_at          timestamp with time zone not null
);
create index idx_reminders_due on shared.reminders (due_at) where status = 'ACTIVE';
create index idx_reminders_owner on shared.reminders (owner_uid);
create index idx_reminders_household on shared.reminders (household_id);

-- Transactional outbox: rows are written in the same transaction that advances the reminder.
create table shared.notifications (
    id              uuid                     primary key,
    reminder_id     uuid                     not null references shared.reminders (id) on delete cascade,
    household_id    uuid,
    recipient_uid   varchar(128)             not null,
    title           varchar(300)             not null,
    occurrence_at   timestamp with time zone not null,
    status          varchar(16)              not null default 'PENDING' check (status in ('PENDING', 'SENT', 'DEAD')),
    attempts        integer                  not null default 0,
    next_attempt_at timestamp with time zone not null,
    last_error      varchar(1000),
    created_at      timestamp with time zone not null,
    sent_at         timestamp with time zone,
    unique (reminder_id, occurrence_at, recipient_uid)
);
create index idx_notifications_pending on shared.notifications (next_attempt_at) where status = 'PENDING';
create index idx_notifications_recipient on shared.notifications (recipient_uid, created_at);

create table shared.files (
    id            uuid                     primary key,
    owner_uid     varchar(128)             not null,
    household_id  uuid                     references shared.households (id) on delete cascade,
    object_key    varchar(512)             not null unique,
    original_name varchar(255)             not null,
    content_type  varchar(255)             not null,
    size_bytes    bigint                   not null check (size_bytes >= 0),
    sha256        varchar(64)              not null,
    created_at    timestamp with time zone not null
);
create index idx_files_owner on shared.files (owner_uid);
create index idx_files_household on shared.files (household_id);

-- Append-only. No FK to households on purpose: the log must outlive what it describes.
-- Immutability is enforced by a trigger in db/migration/shared_ext.
create table shared.audit_events (
    id           uuid                     primary key,
    actor_uid    varchar(128)             not null,
    household_id uuid,
    action       varchar(100)             not null,
    subject_type varchar(50)              not null,
    subject_id   varchar(128),
    details      jsonb                    not null default '{}',
    created_at   timestamp with time zone not null
);
create index idx_audit_household on shared.audit_events (household_id, created_at, id);
create index idx_audit_actor on shared.audit_events (actor_uid, created_at, id);
