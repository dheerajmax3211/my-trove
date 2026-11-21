-- Not read by the jOOQ generator (partial index). At most one ACTIVE signing key at any time, so two instances
-- starting together cannot both create the first key.
create unique index signing_keys_one_active on auth.signing_keys (status) where status = 'ACTIVE';
