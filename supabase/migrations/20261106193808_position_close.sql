-- Closing a position early: the app cancels the open Flash orders (entry remainder, take-profit / stop) and
-- sells what was bought at market. The sell is tracked like the other orders.
--   close_order_id  Flash order id of that market sell
--   bought_amount   amount of the asset received by the entry (from Flash fills), for live P&L and the sell
--   spent_usd       USDC actually spent by the entry (from Flash fills)
-- New statuses: closing (sell submitted, not filled yet) and closed (sold by the user).

alter table public.applications
  add column if not exists close_order_id text,
  add column if not exists bought_amount double precision,
  add column if not exists spent_usd double precision;

alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications
  add constraint applications_status_check check (status in
    ('waiting', 'filled', 'take_profit', 'stop_loss', 'cancelled', 'unprotected', 'failed', 'closing', 'closed'));
