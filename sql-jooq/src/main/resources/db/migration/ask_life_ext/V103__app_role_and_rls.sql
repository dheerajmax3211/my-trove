-- Application role and row-level security.
--
-- ask_life_app is NOLOGIN: the service reaches it with SET LOCAL ROLE inside each transaction (see OwnerScope),
-- or a deployment may instead grant LOGIN and connect as it directly (then set app.rls.role= to disable SET ROLE).
-- It is NOT a superuser and does NOT own the tables, so RLS applies to it. FORCE ROW LEVEL SECURITY additionally
-- subjects the table owner to the policies (only superusers and BYPASSRLS roles are exempt).
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'ask_life_app') then
        create role ask_life_app nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
    end if;
    -- let the migrating/connecting role switch to it (superusers can anyway)
    if not exists (select 1 from pg_auth_members m
                   join pg_roles r on r.oid = m.roleid
                   join pg_roles u on u.oid = m.member
                   where r.rolname = 'ask_life_app' and u.rolname = current_user)
       and not (select rolsuper from pg_roles where rolname = current_user) then
        execute format('grant ask_life_app to %I', current_user);
    end if;
end
$$;

grant usage on schema ask_life to ask_life_app;
grant select, insert, update, delete on ask_life.documents, ask_life.chunks, ask_life.ingestion_jobs to ask_life_app;

alter table ask_life.documents enable row level security;
alter table ask_life.documents force row level security;
alter table ask_life.chunks enable row level security;
alter table ask_life.chunks force row level security;

-- current_setting(..., true) yields NULL/'' when the owner was never set: comparison is then not true and
-- the policy hides every row (fail closed). owner_uid is constrained to be non-empty.
create policy documents_owner_isolation on ask_life.documents
    using (owner_uid = current_setting('app.owner_uid', true))
    with check (owner_uid = current_setting('app.owner_uid', true));

create policy chunks_owner_isolation on ask_life.chunks
    using (owner_uid = current_setting('app.owner_uid', true))
    with check (owner_uid = current_setting('app.owner_uid', true));

-- ingestion_jobs deliberately has no RLS: the worker claims jobs across all owners. A job row holds only
-- ids, a content hash and an error string, never document text.
