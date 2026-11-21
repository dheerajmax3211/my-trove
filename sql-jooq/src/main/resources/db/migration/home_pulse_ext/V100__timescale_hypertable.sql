-- TimescaleDB pieces for home-pulse. NOT parseable by the jOOQ generator -> lives in the home_pulse_ext
-- Flyway location. Numbering starts at 100 because both locations share one flyway_schema_history table.
create extension if not exists timescaledb;

-- raw readings -> hypertable, 1 day chunks (high-frequency data; ~3 MB/day per device at 1 Hz before compression)
select public.create_hypertable('home_pulse.readings', 'ts', chunk_time_interval => interval '1 day');

-- columnar compression: segment by device so per-device range scans stay cheap
alter table home_pulse.readings set (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id',
    timescaledb.compress_orderby = 'ts desc'
);
