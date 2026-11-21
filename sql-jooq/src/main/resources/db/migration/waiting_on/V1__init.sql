create schema if not exists waiting_on;

-- Things a person is waiting for from someone else. One Temporal workflow per row (workflow_id).
create table waiting_on.items (
    id                  uuid                     primary key,
    owner_uid           varchar(128)             not null,
    title               varchar(200)             not null,
    counterparty        varchar(200)             not null,
    counterparty_email  varchar(320),
    category            varchar(20)              not null
        check (category in ('REFUND', 'CLAIM', 'REIMBURSEMENT', 'APPROVAL', 'DELIVERY', 'OTHER')),
    amount              numeric(14, 2)
        check (amount is null or amount >= 0),
    currency            varchar(3),
    expected_by         date                     not null,
    status              varchar(20)              not null
        check (status in ('OPEN', 'NUDGED', 'ESCALATED', 'RESOLVED', 'EXPIRED', 'CANCELLED')),
    outcome             varchar(1000),
    -- secret token embedded in the reply-to plus-address (waiting+<token>@domain)
    reply_token         varchar(40)              not null unique,
    workflow_id         varchar(100)             not null unique,
    -- escalation plan: days after workflow start. final_notice_after_days = 0 means "no final stage"
    nudge_after_days    integer                  not null check (nudge_after_days >= 1),
    escalate_after_days integer                  not null,
    final_notice_after_days integer              not null check (final_notice_after_days >= 0),
    expire_after_days   integer                  not null,
    created_at          timestamp with time zone not null default now(),
    updated_at          timestamp with time zone not null default now(),
    closed_at           timestamp with time zone
);

create index items_owner_created_idx on waiting_on.items (owner_uid, created_at desc);
create index items_owner_status_idx on waiting_on.items (owner_uid, status);

-- Append-only timeline. The "append-only" guarantee is enforced by triggers in the _ext migration location.
create table waiting_on.item_events (
    seq         bigint generated always as identity primary key,
    id          uuid                     not null unique,
    item_id     uuid                     not null references waiting_on.items (id),
    owner_uid   varchar(128)             not null,
    type        varchar(40)              not null,
    summary     varchar(300)             not null,
    detail      text,
    -- makes retried workflow activities idempotent: one event per (item, dedupe_key)
    dedupe_key  varchar(100),
    occurred_at timestamp with time zone not null default now(),
    unique (item_id, dedupe_key)
);

create index item_events_item_idx on waiting_on.item_events (item_id, seq);
