-- Tamper-evident, DB-enforced append-only audit trail.
-- Lives in the legacy_ext Flyway location because jOOQ's DDL parser does not read plpgsql.

create function legacy.audit_row_hash(
    p_prev bytea, p_id uuid, p_vault uuid, p_seq bigint, p_at timestamptz,
    p_actor_kind text, p_actor_id text, p_event text, p_detail jsonb
) returns bytea
language sql immutable as $$
    select sha256(convert_to(concat_ws('|',
        encode(p_prev, 'hex'),
        p_id::text,
        p_vault::text,
        p_seq::text,
        to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
        p_actor_kind,
        p_actor_id,
        p_event,
        p_detail::text), 'UTF8'))
$$;

-- Assigns the per-vault sequence number and extends the hash chain. Whatever the client sent for these columns is
-- overwritten. The advisory lock serialises concurrent appends to the same vault so the chain has no forks.
create function legacy.audit_log_chain() returns trigger
language plpgsql as $$
declare
    last_row record;
begin
    perform pg_advisory_xact_lock(hashtextextended(NEW.vault_id::text, 7311));
    select a.vault_seq, a.hash into last_row
      from legacy.audit_log a where a.vault_id = NEW.vault_id
     order by a.vault_seq desc limit 1;
    if found then
        NEW.vault_seq := last_row.vault_seq + 1;
        NEW.prev_hash := last_row.hash;
    else
        NEW.vault_seq := 1;
        NEW.prev_hash := decode(repeat('00', 32), 'hex');
    end if;
    NEW.hash := legacy.audit_row_hash(NEW.prev_hash, NEW.id, NEW.vault_id, NEW.vault_seq, NEW.at,
                                      NEW.actor_kind, NEW.actor_id, NEW.event_type, NEW.detail);
    return NEW;
end
$$;

create trigger audit_log_chain_bi
    before insert on legacy.audit_log
    for each row execute function legacy.audit_log_chain();

create function legacy.audit_log_immutable() returns trigger
language plpgsql as $$
begin
    raise exception 'legacy.audit_log is append-only (% rejected)', TG_OP
        using errcode = 'insufficient_privilege';
end
$$;

create trigger audit_log_no_update_delete
    before update or delete on legacy.audit_log
    for each row execute function legacy.audit_log_immutable();

create trigger audit_log_no_truncate
    before truncate on legacy.audit_log
    for each statement execute function legacy.audit_log_immutable();

-- Recomputes a vault's chain. first_bad_seq is the first row whose stored hash or link does not match (null if
-- intact); head_hash and length are what an owner would anchor externally to also detect tail truncation.
create function legacy.verify_audit_chain(p_vault uuid)
returns table (ok boolean, length bigint, head_hash bytea, first_bad_seq bigint)
language plpgsql stable as $$
declare
    r record;
    expected_prev bytea := decode(repeat('00', 32), 'hex');
    expected_seq bigint := 1;
    bad bigint := null;
    last_hash bytea := null;
    n bigint := 0;
begin
    for r in select * from legacy.audit_log a where a.vault_id = p_vault order by a.vault_seq loop
        n := n + 1;
        if bad is null and (
               r.vault_seq <> expected_seq
            or r.prev_hash <> expected_prev
            or r.hash <> legacy.audit_row_hash(r.prev_hash, r.id, r.vault_id, r.vault_seq, r.at,
                                               r.actor_kind, r.actor_id, r.event_type, r.detail)) then
            bad := r.vault_seq;
        end if;
        expected_prev := r.hash;
        expected_seq := expected_seq + 1;
        last_hash := r.hash;
    end loop;
    return query select bad is null, n, last_hash, bad;
end
$$;
