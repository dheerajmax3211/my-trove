-- Built-in simulator: a device flagged simulated posts generated readings through the real ingest pipeline.
-- Alerts remember whether they came from simulated data so removing the simulation closes exactly those.
alter table home_pulse.devices add column simulated boolean not null default false;
alter table home_pulse.alerts  add column simulated boolean not null default false;
