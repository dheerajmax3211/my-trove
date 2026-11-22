-- ---------------------------------------------------------------------------------------------
-- Invite codes: how a second account joins a treasury household. The owner creates a single-use
-- code, shows it once, and the invitee redeems it on their own account. Only the SHA-256 of the
-- code is stored. Redeeming is an atomic UPDATE ... WHERE used_at IS NULL AND expires_at > now.
-- ---------------------------------------------------------------------------------------------
create table treasury.household_invites (
    id              uuid                     primary key,
    household_id   uuid                     not null references treasury.households (id),
    code_hash       varchar(64)              not null unique,
    role            varchar(16)              not null check (role in ('OWNER', 'APPROVER', 'MEMBER')),
    created_by_uid  varchar(128)             not null,
    created_at      timestamp with time zone not null,
    expires_at      timestamp with time zone not null,
    used_at         timestamp with time zone,
    used_by_uid     varchar(128)
);
create index household_invites_household_idx on treasury.household_invites (household_id, created_at);
