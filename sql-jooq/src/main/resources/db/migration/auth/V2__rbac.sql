-- RBAC: personas (roles) and the permission catalogue. Design: docs/superpowers/specs/2026-11-21-trove-platform-v2-design.md 5.2.
-- Permissions live in Postgres (source of truth); tokens carry a snapshot plus permissions_version.

create table auth.permissions (
    name        varchar(64)  primary key,
    description varchar(255) not null
);

create table auth.role_permissions (
    role_name       varchar(64) not null references auth.roles (name) on delete cascade,
    permission_name varchar(64) not null references auth.permissions (name) on delete cascade,
    primary key (role_name, permission_name)
);

alter table auth.users add column suspended_at       timestamp with time zone;
alter table auth.users add column plan               varchar(32) not null default 'FREE';
alter table auth.users add column permissions_version integer    not null default 1;

insert into auth.roles (name, description) values
    ('OWNER',     'Operates the platform: every permission, can grant ADMIN and OWNER'),
    ('DEVELOPER', 'Builds on the platform: developer apps, API keys, webhooks, sandbox'),
    ('MEMBER',    'Default role for every signed-in person: use the products'),
    ('AUDITOR',   'Read-only access to users, usage and the audit log');

update auth.roles set description = 'Operator and support: manages users and roles, but cannot grant ADMIN or OWNER'
    where name = 'ADMIN';

insert into auth.permissions (name, description) values
    ('products:use',            'Use the six first-party products'),
    ('usage:read:self',         'Read own API usage'),
    ('usage:read:all',          'Read platform-wide usage analytics'),
    ('connections:manage',      'Manage own connected apps'),
    ('apps:manage',             'Manage own developer apps'),
    ('apps:read:all',           'Read every developer app'),
    ('keys:manage',             'Manage own API keys'),
    ('webhooks:manage',         'Manage own webhooks'),
    ('sandbox:use',             'Use the developer sandbox'),
    ('logs:read:own',           'Read own request logs'),
    ('workspaces:manage',       'Manage own workspaces'),
    ('users:read',              'Read users'),
    ('users:write',             'Suspend and restore users'),
    ('roles:assign',            'Assign and revoke non-privileged roles'),
    ('roles:assign:privileged', 'Assign and revoke ADMIN and OWNER'),
    ('plans:manage',            'Change user plans'),
    ('flags:manage',            'Manage feature flags'),
    ('audit:read',              'Read the audit log'),
    ('support:impersonate',     'Start a time-boxed support impersonation session');

-- Role matrix (design 5.2). DEVELOPER and ADMIN list the MEMBER permissions explicitly (they are "MEMBER + ...").
insert into auth.role_permissions (role_name, permission_name) values
    ('MEMBER',    'products:use'),
    ('MEMBER',    'usage:read:self'),
    ('MEMBER',    'connections:manage'),
    ('DEVELOPER', 'products:use'),
    ('DEVELOPER', 'usage:read:self'),
    ('DEVELOPER', 'connections:manage'),
    ('DEVELOPER', 'apps:manage'),
    ('DEVELOPER', 'keys:manage'),
    ('DEVELOPER', 'webhooks:manage'),
    ('DEVELOPER', 'sandbox:use'),
    ('DEVELOPER', 'logs:read:own'),
    ('DEVELOPER', 'workspaces:manage'),
    ('AUDITOR',   'usage:read:all'),
    ('AUDITOR',   'users:read'),
    ('AUDITOR',   'audit:read'),
    ('AUDITOR',   'apps:read:all'),
    ('ADMIN',     'products:use'),
    ('ADMIN',     'usage:read:self'),
    ('ADMIN',     'connections:manage'),
    ('ADMIN',     'users:read'),
    ('ADMIN',     'users:write'),
    ('ADMIN',     'roles:assign'),
    ('ADMIN',     'usage:read:all'),
    ('ADMIN',     'flags:manage'),
    ('ADMIN',     'audit:read'),
    ('ADMIN',     'apps:read:all'),
    ('ADMIN',     'support:impersonate');

-- OWNER holds every permission in the catalogue.
insert into auth.role_permissions (role_name, permission_name)
    select 'OWNER', name from auth.permissions;

-- Legacy USER grants become MEMBER; the USER role is removed.
update auth.user_roles set role_name = 'MEMBER'
    where role_name = 'USER'
      and not exists (select 1 from auth.user_roles m
                      where m.user_id = auth.user_roles.user_id and m.role_name = 'MEMBER');
delete from auth.user_roles where role_name = 'USER';
delete from auth.roles where name = 'USER';
