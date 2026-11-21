-- Ledger invariants enforced by Postgres itself, so no code path (service bug, psql session,
-- future service) can silently break the books. Kept in a separate Flyway location because the
-- jOOQ DDL parser does not read plpgsql.

-- 1. Append-only: ledger rows can never be updated, deleted or truncated. Mistakes are fixed with reversal entries.
create function treasury.reject_ledger_mutation() returns trigger
language plpgsql as $$
begin
    raise exception 'treasury.% is append-only: % is not allowed (post a reversal entry instead)', tg_table_name, tg_op
        using errcode = '23000';
end
$$;

create trigger journal_entries_append_only before update or delete on treasury.journal_entries
    for each row execute function treasury.reject_ledger_mutation();
create trigger journal_entries_no_truncate before truncate on treasury.journal_entries
    for each statement execute function treasury.reject_ledger_mutation();
create trigger postings_append_only before update or delete on treasury.postings
    for each row execute function treasury.reject_ledger_mutation();
create trigger postings_no_truncate before truncate on treasury.postings
    for each statement execute function treasury.reject_ledger_mutation();

-- 2. Every entry: exactly the declared number of postings, at least 2, and zero sum PER CURRENCY.
--    Checked by DEFERRED constraint triggers, i.e. at COMMIT, once the whole entry has been inserted.
create function treasury.assert_entry_valid(p_entry uuid) returns void
language plpgsql as $$
declare
    v_declared integer;
    v_actual   integer;
    v_bad      record;
begin
    select line_count into v_declared from treasury.journal_entries where id = p_entry;
    if not found then
        raise exception 'journal entry % does not exist', p_entry using errcode = '23514';
    end if;
    select count(*) into v_actual from treasury.postings where entry_id = p_entry;
    if v_actual < 2 then
        raise exception 'journal entry % has % posting(s); at least 2 are required', p_entry, v_actual
            using errcode = '23514';
    end if;
    if v_actual <> v_declared then
        raise exception 'journal entry % declares % postings but has %', p_entry, v_declared, v_actual
            using errcode = '23514';
    end if;
    for v_bad in
        select currency, sum(amount) as total
        from treasury.postings where entry_id = p_entry
        group by currency having sum(amount) <> 0
    loop
        raise exception 'journal entry % is unbalanced in %: postings sum to %', p_entry, v_bad.currency, v_bad.total
            using errcode = '23514';
    end loop;
end
$$;

create function treasury.trg_posting_entry_valid() returns trigger
language plpgsql as $$
begin
    perform treasury.assert_entry_valid(new.entry_id);
    return null;
end
$$;

create function treasury.trg_entry_valid() returns trigger
language plpgsql as $$
begin
    perform treasury.assert_entry_valid(new.id);
    return null;
end
$$;

create constraint trigger postings_entry_balanced after insert on treasury.postings
    deferrable initially deferred for each row execute function treasury.trg_posting_entry_valid();
create constraint trigger journal_entries_have_postings after insert on treasury.journal_entries
    deferrable initially deferred for each row execute function treasury.trg_entry_valid();

-- 3. Defence in depth for overdrafts: even if application code forgot to check, the projection row of a
--    non-negative account cannot move to the wrong side of zero. (Debit-normal: balance >= 0; credit-normal: balance <= 0.)
create function treasury.check_balance_side() returns trigger
language plpgsql as $$
declare
    v_acc record;
begin
    select type, allow_negative into v_acc from treasury.accounts where id = new.account_id;
    if not v_acc.allow_negative
       and ((v_acc.type in ('ASSET', 'EXPENSE') and new.balance < 0)
         or (v_acc.type in ('LIABILITY', 'EQUITY', 'INCOME') and new.balance > 0)) then
        raise exception 'account % (%) would be overdrawn: balance %', new.account_id, v_acc.type, new.balance
            using errcode = '23514';
    end if;
    return new;
end
$$;

create trigger account_balances_side before insert or update on treasury.account_balances
    for each row execute function treasury.check_balance_side();

-- 4. Account identity is immutable (changing currency/type under existing postings would rewrite history).
create function treasury.reject_account_identity_change() returns trigger
language plpgsql as $$
begin
    if new.household_id is distinct from old.household_id
       or new.currency is distinct from old.currency
       or new.type is distinct from old.type
       or new.code is distinct from old.code
       or new.owner_uid is distinct from old.owner_uid then
        raise exception 'account % identity (household, owner, code, type, currency) is immutable', old.id
            using errcode = '23000';
    end if;
    return new;
end
$$;

create trigger accounts_identity_immutable before update on treasury.accounts
    for each row execute function treasury.reject_account_identity_change();
