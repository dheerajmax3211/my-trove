-- Refresh policies. start_offset (80 days) deliberately reaches back almost to the raw retention (90 days) so
-- late/backfilled readings are rolled up too, but stays inside it: a refresh window that reached past the
-- retention horizon would re-aggregate chunks that were already dropped and erase their rollups.
-- (The service itself only accepts readings up to 30 days old, see app.ingest.max-age.)
-- Only invalidated buckets are recomputed, so a long start_offset costs nothing on a quiet system.
select public.add_continuous_aggregate_policy('home_pulse.readings_1m',
    start_offset => interval '80 days', end_offset => interval '1 minute', schedule_interval => interval '1 minute');
select public.add_continuous_aggregate_policy('home_pulse.readings_1h',
    start_offset => interval '80 days', end_offset => interval '1 hour', schedule_interval => interval '15 minutes');

-- Compress raw chunks once they are a week old (the evaluator and charts only touch recent raw data).
select public.add_compression_policy('home_pulse.readings', interval '7 days');

-- Retention: raw 90 days, 1-minute rollup 1 year, hourly rollup 5 years.
select public.add_retention_policy('home_pulse.readings', interval '90 days');
select public.add_retention_policy('home_pulse.readings_1m', interval '365 days');
select public.add_retention_policy('home_pulse.readings_1h', interval '1825 days');
