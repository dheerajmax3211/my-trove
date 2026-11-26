-- Which model decided an alert: MAD (the built-in robust-statistics detector, also the fallback) or ML (the trained
-- seasonal model of ml-service). Refreshing an alert updates it, so it always names the model of the latest decision.
alter table home_pulse.alerts add column decided_by text not null default 'MAD';
alter table home_pulse.alerts add constraint alerts_decided_by_check check (decided_by in ('MAD', 'ML'));
