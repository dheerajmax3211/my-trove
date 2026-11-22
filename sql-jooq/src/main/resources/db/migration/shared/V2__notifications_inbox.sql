-- shared.notifications becomes the one outbox and in-app inbox for every service (libs/platform-notify).
-- Producers in other services insert rows here in the same transaction as their business change; the shared-service
-- relay delivers them by email. Rows with in_app = false are email-only (counterparties, trustees): they are never
-- listed in an inbox, and their body and link are cleared once they have been sent or have dead-lettered.

-- Rows that are not tied to a reminder, and recipients who are not platform users (no uid, email only).
alter table shared.notifications alter column reminder_id drop not null;
alter table shared.notifications alter column recipient_uid drop not null;

alter table shared.notifications add column kind varchar(40) not null default 'REMINDER';
alter table shared.notifications add column source varchar(40) not null default 'shared';
alter table shared.notifications add column body varchar(4000);
alter table shared.notifications add column link varchar(500);
alter table shared.notifications add column reply_to varchar(320);
alter table shared.notifications add column recipient_email varchar(320);
alter table shared.notifications add column in_app boolean not null default true;
alter table shared.notifications add column read_at timestamp with time zone;
-- Producers set a stable key (for example "waiting-on:<item>:<hash>"); a retried transaction cannot enqueue twice.
alter table shared.notifications add column dedupe_key varchar(200) unique;

-- Contact book: the newest email address seen for each platform user (filled from the platform token's email claim).
create table shared.user_contacts (
    uid        varchar(128)             primary key,
    email      varchar(320)             not null,
    updated_at timestamp with time zone not null
);
