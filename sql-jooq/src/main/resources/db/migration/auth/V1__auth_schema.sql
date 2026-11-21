create schema if not exists auth;

create table auth.users (
    id            uuid                     primary key default gen_random_uuid(),
    firebase_uid  varchar(128)             not null unique,
    email         varchar(320),
    display_name  varchar(255),
    created_at    timestamp with time zone not null default now(),
    last_login_at timestamp with time zone
);

create table auth.roles (
    name        varchar(64)  primary key,
    description varchar(255) not null
);

create table auth.user_roles (
    user_id    uuid                     not null references auth.users (id) on delete cascade,
    role_name  varchar(64)              not null references auth.roles (name),
    granted_at timestamp with time zone not null default now(),
    granted_by uuid                     references auth.users (id),
    primary key (user_id, role_name)
);

insert into auth.roles (name, description) values
    ('USER',  'Default role for every authenticated user'),
    ('ADMIN', 'Can manage users and roles');
