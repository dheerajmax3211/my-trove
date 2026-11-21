create schema if not exists treasury;

-- ---------------------------------------------------------------------------------------------
-- Households and membership.
-- The membership table is OWNED BY THIS SERVICE for the first slice. A later integration is
-- expected to source membership from shared-service (see family-treasury/HANDOFF.md).
-- ---------------------------------------------------------------------------------------------
create table treasury.households (
    id                      uuid                     primary key,
    name                    varchar(200)             not null,
    currency                char(3)                  not null,
    -- A spend strictly ABOVE this amount (minor units) needs approval. NULL = approvals disabled.
    approval_threshold      bigint                   check (approval_threshold is null or approval_threshold >= 0),
    approval_expiry_hours   integer                  not null default 72 check (approval_expiry_hours between 1 and 8760),
    created_by_uid          varchar(128)             not null,
    created_at              timestamp with time zone not null
);

create table treasury.household_members (
    household_id  uuid                     not null references treasury.households (id),
    uid           varchar(128)             not null,
    role          varchar(16)              not null check (role in ('OWNER', 'APPROVER', 'MEMBER', 'KID')),
    display_name  varchar(200),
    created_at    timestamp with time zone not null,
    primary key (household_id, uid)
);
create index household_members_uid_idx on treasury.household_members (uid);

-- ---------------------------------------------------------------------------------------------
-- Chart of accounts.
-- Sign convention for postings: positive = DEBIT, negative = CREDIT. ASSET and EXPENSE accounts
-- are debit-normal, LIABILITY / EQUITY / INCOME are credit-normal.
-- owner_uid NULL = household-level account (pool, categories); set = a member's sub-account/pot.
-- ---------------------------------------------------------------------------------------------
create table treasury.accounts (
    id              uuid                     primary key,
    household_id    uuid                     not null references treasury.households (id),
    owner_uid       varchar(128),
    code            varchar(160)             not null,
    name            varchar(200)             not null,
    type            varchar(16)              not null check (type in ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')),
    currency        char(3)                  not null,
    allow_negative  boolean                  not null default false,
    created_at      timestamp with time zone not null,
    unique (household_id, code),
    -- referenced by composite foreign keys so a posting can never name another household's account
    -- or carry a currency different from its account's
    unique (id, household_id, currency)
);
create index accounts_household_idx on treasury.accounts (household_id);

-- ---------------------------------------------------------------------------------------------
-- Approval requests (declared before journal_entries, which may point at the approval that caused them).
-- ---------------------------------------------------------------------------------------------
create table treasury.approval_requests (
    id                uuid                     primary key,
    household_id      uuid                     not null references treasury.households (id),
    requested_by_uid  varchar(128)             not null,
    kind              varchar(16)              not null check (kind in ('SPEND')),
    from_account_id   uuid                     not null references treasury.accounts (id),
    to_account_id     uuid                     not null references treasury.accounts (id),
    amount            bigint                   not null check (amount > 0),
    currency          char(3)                  not null,
    description       varchar(500)             not null,
    status            varchar(24)              not null check (status in ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED')),
    expires_at        timestamp with time zone not null,
    decided_by_uid    varchar(128),
    decided_at        timestamp with time zone,
    decision_note     varchar(500),
    entry_id          uuid,
    created_at        timestamp with time zone not null,
    unique (id, household_id)
);
create index approval_requests_household_idx on treasury.approval_requests (household_id, status, created_at);

-- ---------------------------------------------------------------------------------------------
-- The ledger. journal_entries and postings are APPEND-ONLY (enforced by triggers in treasury_ext).
-- ---------------------------------------------------------------------------------------------
create table treasury.journal_entries (
    id                uuid                     primary key,
    household_id      uuid                     not null references treasury.households (id),
    idempotency_key   varchar(300)             not null,
    kind              varchar(16)              not null check (kind in ('DEPOSIT', 'SPEND', 'TRANSFER', 'SPLIT', 'REVERSAL', 'ALLOWANCE')),
    description       varchar(500)             not null,
    -- number of postings this entry is declared to have; the deferred trigger checks it matches
    line_count        integer                  not null check (line_count >= 2),
    posted_at         timestamp with time zone not null,
    reverses_entry_id uuid                     unique references treasury.journal_entries (id),
    approval_id       uuid                     references treasury.approval_requests (id),
    created_by_uid    varchar(128)             not null,
    unique (household_id, idempotency_key),
    unique (id, household_id)
);
create index journal_entries_household_idx on treasury.journal_entries (household_id, posted_at);

create table treasury.postings (
    id            uuid     primary key,
    seq           bigint   generated always as identity,
    entry_id      uuid     not null,
    household_id  uuid     not null,
    account_id    uuid     not null,
    -- signed minor units: positive = debit, negative = credit. Never floating point.
    amount        bigint   not null check (amount <> 0),
    currency      char(3)  not null,
    foreign key (entry_id, household_id) references treasury.journal_entries (id, household_id),
    foreign key (account_id, household_id, currency) references treasury.accounts (id, household_id, currency)
);
create unique index postings_seq_idx on treasury.postings (seq);
create index postings_entry_idx on treasury.postings (entry_id);
create index postings_account_idx on treasury.postings (account_id, seq);

-- ---------------------------------------------------------------------------------------------
-- CQRS read model: balance projection, updated in the SAME transaction as the postings insert
-- while holding a row lock. balance = SUM(postings.amount) (raw signed, debit positive).
-- ---------------------------------------------------------------------------------------------
create table treasury.account_balances (
    account_id    uuid                     primary key,
    household_id  uuid                     not null,
    currency      char(3)                  not null,
    balance       bigint                   not null default 0,
    version       bigint                   not null default 0,
    updated_at    timestamp with time zone not null,
    foreign key (account_id, household_id, currency) references treasury.accounts (id, household_id, currency)
);

-- ---------------------------------------------------------------------------------------------
-- Idempotency records: one per (scope, key). Written in the same transaction as the operation,
-- so a record exists if and only if the operation committed.
-- scope = household id for household operations, 'user:<uid>' for operations that create a household.
-- ---------------------------------------------------------------------------------------------
create table treasury.idempotency_records (
    scope          varchar(160)             not null,
    idem_key       varchar(200)             not null,
    request_hash   char(64)                 not null,
    status         integer                  not null,
    response       text                     not null,
    created_at     timestamp with time zone not null,
    primary key (scope, idem_key)
);

-- ---------------------------------------------------------------------------------------------
-- Allowance schedules and their per-period run log.
-- ---------------------------------------------------------------------------------------------
create table treasury.allowance_schedules (
    id               uuid                     primary key,
    household_id     uuid                     not null references treasury.households (id),
    from_account_id  uuid                     not null references treasury.accounts (id),
    to_account_id    uuid                     not null references treasury.accounts (id),
    amount           bigint                   not null check (amount > 0),
    currency         char(3)                  not null,
    frequency        varchar(8)               not null check (frequency in ('WEEKLY', 'MONTHLY')),
    start_date       date                     not null,
    -- first period start (>= start_date) that has not been processed yet
    next_due_on      date                     not null,
    active           boolean                  not null default true,
    description      varchar(200)             not null,
    created_by_uid   varchar(128)             not null,
    created_at       timestamp with time zone not null
);
create index allowance_schedules_due_idx on treasury.allowance_schedules (next_due_on) where active;

create table treasury.allowance_runs (
    schedule_id   uuid                     not null references treasury.allowance_schedules (id),
    period_start  date                     not null,
    status        varchar(8)               not null check (status in ('PAID', 'SKIPPED', 'FAILED')),
    entry_id      uuid                     references treasury.journal_entries (id),
    reason        varchar(300),
    created_at    timestamp with time zone not null,
    primary key (schedule_id, period_start)
);
