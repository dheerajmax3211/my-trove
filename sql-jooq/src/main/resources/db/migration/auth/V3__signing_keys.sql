-- RSA signing keys for platform tokens. The private key is stored encrypted (AES-256-GCM, key-encryption key from
-- configuration) and never in plaintext. Exactly one ACTIVE key is enforced in auth_ext (partial unique index).
create table auth.signing_keys (
    kid             varchar(64)              primary key,
    algorithm       varchar(16)              not null,
    status          varchar(16)              not null check (status in ('ACTIVE', 'RETIRED')),
    public_jwk      text                     not null,
    private_key_enc bytea                    not null,
    enc_alg         varchar(32)              not null,
    created_at      timestamp with time zone not null,
    retired_at      timestamp with time zone,
    verify_until    timestamp with time zone
);
