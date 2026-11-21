-- Not read by the jOOQ generator (partial index). At most one ACTIVE signing key at any time.
create unique index signing_keys_one_active on consent.signing_keys (status) where status = 'ACTIVE';
