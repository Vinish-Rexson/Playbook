-- Move the Playbook tables into `public` so they show in Supabase's Table Editor by default.
--
-- `public` is exposed by Supabase's Data API, so lock it down: Row Level Security is on with no
-- policies, and the API roles (anon = publishable key, authenticated) get no table privileges.
-- The app's server connects as `postgres` through DATABASE_URL, which these rules don't limit.

alter table playbook.traders set schema public;
alter table playbook.templates set schema public;
alter table playbook.applications set schema public;
alter table playbook.quotes set schema public;
drop schema playbook;

alter table public.traders enable row level security;
alter table public.templates enable row level security;
alter table public.applications enable row level security;
alter table public.quotes enable row level security;

revoke all on public.traders, public.templates, public.applications, public.quotes from anon, authenticated;

comment on table public.traders is 'Creators who publish playbooks. 0x000…000 is the official Playbook account.';
comment on table public.templates is 'Published playbooks: entry offset, take-profit, stop-loss and creator cut (percent).';
comment on table public.applications is 'Positions: one applied playbook = a Flash entry order plus its take-profit / stop-loss bracket.';
comment on table public.quotes is 'Flash quotes waiting to be signed; single-use, deleted after 15 minutes.';
