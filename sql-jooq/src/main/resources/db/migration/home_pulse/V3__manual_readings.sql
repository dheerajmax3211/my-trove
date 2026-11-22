-- Manual readings: the owner enters a meter's running total (kWh) or imports timestamp,watts rows. They are stored
-- under a device flagged manual. A manual device has no token that works (its token is generated and dropped at
-- creation), it never reports by itself, and it takes the appliance's single live device slot, so a real plug and
-- manual entries never feed the same appliance at the same time.
alter table home_pulse.devices add column manual boolean not null default false;

-- Running meter totals entered by hand, one per reading time and manual device. The difference between two
-- consecutive totals becomes average-power readings for the minutes in between.
create table home_pulse.meter_totals (
    device_id  uuid             not null references home_pulse.devices (id) on delete cascade,
    ts         timestamptz      not null,
    kwh        double precision not null check (kwh >= 0),
    primary key (device_id, ts)
);
