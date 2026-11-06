-- More of Flash's order options on playbooks (Flash docs: Placing Orders, TWAP Order, Bracket Orders).
--   entry_type          market | limit | twap (DCA: the buy is split into slices over a duration)
--   twap_minutes        DCA duration (Flash minimum 5 minutes)
--   twap_slices         DCA slices (Flash allows 2–2560)
--   entry_expiry_hours  limit buy expires after this many hours; null = good until cancelled
--   bracket_expiry_days take-profit / stop protection expires after this many days; null = never
--   max_slippage_pct    market buy slippage cap in %; null = Flash's recommended value
-- Existing playbooks keep their behaviour: a dip below the price is a limit buy, no dip is a market buy.

alter table public.templates
  add column if not exists entry_type text check (entry_type in ('market', 'limit', 'twap')),
  add column if not exists twap_minutes integer check (twap_minutes between 5 and 10080),
  add column if not exists twap_slices integer check (twap_slices between 2 and 2560),
  add column if not exists entry_expiry_hours integer check (entry_expiry_hours between 1 and 8760),
  add column if not exists bracket_expiry_days integer check (bracket_expiry_days between 1 and 365),
  add column if not exists max_slippage_pct double precision check (max_slippage_pct > 0 and max_slippage_pct <= 10);

update public.templates
set entry_type = case when entry_offset_pct < 0 then 'limit' else 'market' end
where entry_type is null;

alter table public.templates alter column entry_type set not null;
alter table public.templates alter column entry_type set default 'market';

-- Positions can now come from a DCA (TWAP) entry.
alter table public.applications drop constraint if exists applications_order_type_check;
alter table public.applications
  add constraint applications_order_type_check check (order_type in ('market', 'limit', 'twap'));
