-- TimescaleDB pieces for platform-service. NOT parseable by the jOOQ generator -> lives in the platform_ext Flyway
-- location. Numbering starts at 100 because both locations share one flyway_schema_history table.
create extension if not exists timescaledb;

-- raw usage events -> hypertable, 7 day chunks (modest volume: one row per proxied request)
select public.create_hypertable('platform.usage_events', 'ts', chunk_time_interval => interval '7 days');
