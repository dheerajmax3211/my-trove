-- 1-minute and 1-hour rollups. Real-time aggregation (materialized_only = false) so queries and the
-- anomaly evaluator see data newer than the last materialization. WITH NO DATA because creating a
-- continuous aggregate with data is not allowed inside Flyway's transaction (the table is empty here anyway).
create materialized view home_pulse.readings_1m
with (timescaledb.continuous, timescaledb.materialized_only = false) as
select device_id,
       time_bucket(interval '1 minute', ts) as bucket,
       avg(watts)  as avg_watts,
       max(watts)  as max_watts,
       min(watts)  as min_watts,
       avg(volts)  as avg_volts,
       avg(amps)   as avg_amps,
       count(*)    as samples
from home_pulse.readings
group by device_id, time_bucket(interval '1 minute', ts)
with no data;

create materialized view home_pulse.readings_1h
with (timescaledb.continuous, timescaledb.materialized_only = false) as
select device_id,
       time_bucket(interval '1 hour', ts) as bucket,
       avg(watts)  as avg_watts,
       max(watts)  as max_watts,
       min(watts)  as min_watts,
       avg(volts)  as avg_volts,
       avg(amps)   as avg_amps,
       count(*)    as samples
from home_pulse.readings
group by device_id, time_bucket(interval '1 hour', ts)
with no data;

create index readings_1m_device_bucket_idx on home_pulse.readings_1m (device_id, bucket desc);
create index readings_1h_device_bucket_idx on home_pulse.readings_1h (device_id, bucket desc);
