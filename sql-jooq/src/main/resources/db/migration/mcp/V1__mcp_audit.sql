-- mcp-server: one row per tools/call (brief 82). Plain tables only (readable by the jOOQ DDL parser).
-- The arguments are never stored, only the SHA-256 hex digest of their canonical JSON, so the log proves what was
-- asked without keeping personal search queries. Append-only: see mcp_ext/V100.
create schema if not exists mcp;

create table mcp.tool_calls (
    id             uuid         primary key,
    principal_type varchar(16)  not null check (principal_type in ('USER', 'API_KEY', 'UNKNOWN')),
    principal_id   varchar(160) not null,
    tool           varchar(128) not null,
    arguments_hash varchar(64)  not null,
    result_bytes   integer      not null check (result_bytes >= 0),
    outcome        varchar(16)  not null check (outcome in ('OK', 'DENIED', 'INVALID', 'UNKNOWN_TOOL', 'ERROR')),
    error_code     varchar(64),
    duration_ms    integer      not null check (duration_ms >= 0),
    called_at      timestamptz  not null default now()
);

create index tool_calls_principal_idx on mcp.tool_calls (principal_id, called_at);
create index tool_calls_called_at_idx on mcp.tool_calls (called_at);
