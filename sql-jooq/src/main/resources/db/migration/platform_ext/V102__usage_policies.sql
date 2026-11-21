-- Refresh policies. start_offset deliberately reaches back almost to the raw retention (90 days) for the hourly and
-- daily views so late events are rolled up too, but stays inside it: a refresh window that reached past the retention
-- horizon would re-aggregate chunks that were already dropped and erase their rollups. Only invalidated buckets are
-- recomputed, so a long start_offset costs nothing on a quiet system. The one-minute view is only kept 30 days and
-- only refreshes the last 7. end_offset keeps the newest, still-filling bucket out of the materialization: real-time
-- aggregation serves it from the raw rows (for the daily view that is "today's raw rows").
select public.add_continuous_aggregate_policy('platform.usage_1m',
    start_offset => interval '7 days', end_offset => interval '1 minute', schedule_interval => interval '1 minute');
select public.add_continuous_aggregate_policy('platform.usage_1h',
    start_offset => interval '80 days', end_offset => interval '1 hour', schedule_interval => interval '15 minutes');
select public.add_continuous_aggregate_policy('platform.usage_1d',
    start_offset => interval '80 days', end_offset => interval '1 day', schedule_interval => interval '1 hour');

-- Retention: raw 90 days, 1-minute rollup 30 days, hourly rollup 1 year, daily rollup 5 years.
select public.add_retention_policy('platform.usage_events', interval '90 days');
select public.add_retention_policy('platform.usage_1m', interval '30 days');
select public.add_retention_policy('platform.usage_1h', interval '365 days');
select public.add_retention_policy('platform.usage_1d', interval '1825 days');
