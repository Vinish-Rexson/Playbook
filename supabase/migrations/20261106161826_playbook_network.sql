-- Creators choose where a playbook trades: ETH on Base, SOL on Solana, or both (the user picks when applying).
-- Existing playbooks keep working on both networks.
alter table public.templates
  add column if not exists chain text not null default 'both' check (chain in ('both', 'base', 'solana'));

comment on column public.templates.chain is 'Where the playbook trades: base (ETH), solana (SOL) or both.';
