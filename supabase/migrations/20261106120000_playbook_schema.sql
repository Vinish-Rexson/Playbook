-- Playbook database (Supabase Postgres). Applied with `npm run db:push` (Supabase CLI). Idempotent.
--
-- Everything lives in its own `playbook` schema. Supabase's Data API only exposes `public`,
-- so these tables are reachable only through the app's server (DATABASE_URL), never with the
-- publishable key.
--
-- Trader and creator addresses are stored lowercase. Money and prices are USD as double precision.

create schema if not exists playbook;

-- Creators who publish strategies. The zero address is Playbook's own "house" account.
create table if not exists playbook.traders (
  address     text primary key check (address = lower(address)),
  name        text not null,
  handle      text not null,
  bio         text not null default '',
  avatar      text not null default '',
  official    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Published strategies ("playbooks").
create table if not exists playbook.templates (
  id                text primary key,
  creator           text not null references playbook.traders (address),
  name              text not null,
  description       text not null default '',
  entry_offset_pct  double precision not null check (entry_offset_pct <= 0),
  take_profit_pct   double precision not null check (take_profit_pct > 0),
  stop_loss_pct     double precision not null check (stop_loss_pct > 0),
  cut_pct           double precision not null check (cut_pct >= 0),
  created_at        timestamptz not null default now()
);
create index if not exists templates_creator_idx on playbook.templates (creator);

-- One row per applied playbook: the Flash entry order plus its take-profit / stop-loss bracket.
create table if not exists playbook.applications (
  id                     text primary key,
  template_id            text not null references playbook.templates (id),
  template_name          text not null,
  creator                text not null check (creator = lower(creator)),
  funder                 text not null, -- as signed (checksummed); Flash reads use it as-is
  amount_usd             double precision not null,
  order_type             text not null check (order_type in ('market', 'limit')),
  market_price_at_apply  double precision not null,
  entry_price            double precision not null,
  take_profit_price      double precision not null,
  stop_loss_price        double precision not null,
  cut_bps                integer not null,
  order_id               text not null unique,
  bracket_order_id       text,
  status                 text not null check (status in
                           ('waiting', 'filled', 'take_profit', 'stop_loss', 'cancelled', 'unprotected', 'failed')),
  filled_price           double precision,
  exit_price             double precision,
  pnl_usd                double precision,
  creator_fee_usd        double precision not null default 0,
  txs                    jsonb not null default '[]',
  close_reason           text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists applications_funder_idx on playbook.applications (lower(funder), created_at desc);
create index if not exists applications_template_idx on playbook.applications (template_id, created_at desc);
create index if not exists applications_creator_idx on playbook.applications (creator, created_at desc);

-- Server-built Flash quotes waiting to be signed. Submit re-uses the stored request, so the
-- fee and prices can't be changed by the client. Rows older than 15 minutes are deleted.
create table if not exists playbook.quotes (
  quote_id     text primary key,
  template_id  text not null,
  funder       text not null,
  body         jsonb not null,
  bracket      jsonb,
  typed        jsonb not null,
  plan         jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists quotes_created_idx on playbook.quotes (created_at);

-- Seed: the house account and the four starter playbooks.
insert into playbook.traders (address, name, handle, bio, avatar, official) values
  ('0x0000000000000000000000000000000000000000', 'Playbook', 'playbook',
   'Starter strategies from the Playbook team. Publish your own from the Create tab.', '📘', true)
on conflict (address) do nothing;

insert into playbook.templates
  (id, creator, name, description, entry_offset_pct, take_profit_pct, stop_loss_pct, cut_pct, created_at) values
  ('tpl_deepvalue', '0x0000000000000000000000000000000000000000', 'Deep Value',
   'Only buys a real flush: 6% below today. Targets a 12% recovery.', -6, 12, 5, 1, now()),
  ('tpl_rangerider', '0x0000000000000000000000000000000000000000', 'Range Rider',
   'Small dip, small target. Designed to hit often in sideways markets.', -1, 2.5, 1.5, 0.3, now() - interval '1 second'),
  ('tpl_dipcatcher', '0x0000000000000000000000000000000000000000', 'Dip Catcher',
   'Waits for a 2% dip, then rides the bounce to +5%. Stop at -3% keeps losses small.', -2, 5, 3, 0.5, now() - interval '2 seconds'),
  ('tpl_quickscalp', '0x0000000000000000000000000000000000000000', 'Quick Scalp',
   'Buys now, takes profit on a 0.3% move, cuts the loss at 0.3%. Fast in, fast out.', 0, 0.3, 0.3, 0.5, now() - interval '3 seconds')
on conflict (id) do nothing;
