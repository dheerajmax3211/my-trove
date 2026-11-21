-- 1-minute, 1-hour and 1-day rollups by service, principal and status class. Real-time aggregation
-- (materialized_only = false) so quota checks and dashboards see data newer than the last materialization (the daily
-- view therefore already is "the daily aggregate plus today's raw rows"). WITH NO DATA because creating a continuous
-- aggregate with data is not allowed inside Flyway's transaction (the table is empty here anyway).
--
-- Latency is stored as nine DISJOINT bucket counts so percentiles can be interpolated without the Timescale toolkit:
--   lat_0_10 (<= 10 ms), lat_10_25, lat_25_50, lat_50_100, lat_100_250, lat_250_500, lat_500_1000, lat_1000_2500,
--   lat_2500_inf (> 2500 ms); upper bounds are inclusive. latency_max_ms bounds the open-ended last bucket.
-- status_class is 1..5 (the hundreds digit of the HTTP status).
create materialized view platform.usage_1m
with (timescaledb.continuous, timescaledb.materialized_only = false) as
select time_bucket(interval '1 minute', ts) as bucket,
       service,
       principal_type,
       principal_id,
       (status / 100) as status_class,
       count(*) as requests,
       count(*) filter (where rate_limited) as rate_limited,
       count(*) filter (where latency_ms <= 10) as lat_0_10,
       count(*) filter (where latency_ms > 10 and latency_ms <= 25) as lat_10_25,
       count(*) filter (where latency_ms > 25 and latency_ms <= 50) as lat_25_50,
       count(*) filter (where latency_ms > 50 and latency_ms <= 100) as lat_50_100,
       count(*) filter (where latency_ms > 100 and latency_ms <= 250) as lat_100_250,
       count(*) filter (where latency_ms > 250 and latency_ms <= 500) as lat_250_500,
       count(*) filter (where latency_ms > 500 and latency_ms <= 1000) as lat_500_1000,
       count(*) filter (where latency_ms > 1000 and latency_ms <= 2500) as lat_1000_2500,
       count(*) filter (where latency_ms > 2500) as lat_2500_inf,
       sum(latency_ms)::bigint as latency_sum_ms,
       max(latency_ms) as latency_max_ms
from platform.usage_events
group by time_bucket(interval '1 minute', ts), service, principal_type, principal_id, (status / 100)
with no data;

create materialized view platform.usage_1h
with (timescaledb.continuous, timescaledb.materialized_only = false) as
select time_bucket(interval '1 hour', ts) as bucket,
       service,
       principal_type,
       principal_id,
       (status / 100) as status_class,
       count(*) as requests,
       count(*) filter (where rate_limited) as rate_limited,
       count(*) filter (where latency_ms <= 10) as lat_0_10,
       count(*) filter (where latency_ms > 10 and latency_ms <= 25) as lat_10_25,
       count(*) filter (where latency_ms > 25 and latency_ms <= 50) as lat_25_50,
       count(*) filter (where latency_ms > 50 and latency_ms <= 100) as lat_50_100,
       count(*) filter (where latency_ms > 100 and latency_ms <= 250) as lat_100_250,
       count(*) filter (where latency_ms > 250 and latency_ms <= 500) as lat_250_500,
       count(*) filter (where latency_ms > 500 and latency_ms <= 1000) as lat_500_1000,
       count(*) filter (where latency_ms > 1000 and latency_ms <= 2500) as lat_1000_2500,
       count(*) filter (where latency_ms > 2500) as lat_2500_inf,
       sum(latency_ms)::bigint as latency_sum_ms,
       max(latency_ms) as latency_max_ms
from platform.usage_events
group by time_bucket(interval '1 hour', ts), service, principal_type, principal_id, (status / 100)
with no data;

create materialized view platform.usage_1d
with (timescaledb.continuous, timescaledb.materialized_only = false) as
select time_bucket(interval '1 day', ts) as bucket,
       service,
       principal_type,
       principal_id,
       (status / 100) as status_class,
       count(*) as requests,
       count(*) filter (where rate_limited) as rate_limited,
       count(*) filter (where latency_ms <= 10) as lat_0_10,
       count(*) filter (where latency_ms > 10 and latency_ms <= 25) as lat_10_25,
       count(*) filter (where latency_ms > 25 and latency_ms <= 50) as lat_25_50,
       count(*) filter (where latency_ms > 50 and latency_ms <= 100) as lat_50_100,
       count(*) filter (where latency_ms > 100 and latency_ms <= 250) as lat_100_250,
       count(*) filter (where latency_ms > 250 and latency_ms <= 500) as lat_250_500,
       count(*) filter (where latency_ms > 500 and latency_ms <= 1000) as lat_500_1000,
       count(*) filter (where latency_ms > 1000 and latency_ms <= 2500) as lat_1000_2500,
       count(*) filter (where latency_ms > 2500) as lat_2500_inf,
       sum(latency_ms)::bigint as latency_sum_ms,
       max(latency_ms) as latency_max_ms
from platform.usage_events
group by time_bucket(interval '1 day', ts), service, principal_type, principal_id, (status / 100)
with no data;

-- principal lookups (quota, "me", top users)
create index usage_1m_principal_bucket_idx on platform.usage_1m (principal_id, bucket desc);
create index usage_1h_principal_bucket_idx on platform.usage_1h (principal_id, bucket desc);
create index usage_1d_principal_bucket_idx on platform.usage_1d (principal_id, bucket desc);
