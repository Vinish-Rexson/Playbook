-- Solana next to Base. Playbooks stay network-agnostic (they are percentages); each position and
-- pending quote records the network it runs on. Existing rows are Base.

alter table public.applications
  add column if not exists chain text not null default 'base' check (chain in ('base', 'solana'));

alter table public.quotes
  add column if not exists chain text not null default 'base' check (chain in ('base', 'solana'));

-- Solana signing and funding material from the Flash quote (order messages, nonces, setup instructions).
alter table public.quotes add column if not exists svm jsonb;

-- Solana addresses are case-sensitive base58, so they are matched exactly (Base ones case-insensitively).
create index if not exists applications_sol_funder_idx on public.applications (funder, created_at desc)
  where chain = 'solana';

comment on column public.applications.chain is 'Network the position runs on: base (ETH/USDC) or solana (SOL/USDC).';
