/// <reference types="node" />
// Postgres store (Supabase). Tables live in `public` with RLS on and no API access: see supabase/migrations and
// `npm run db:push`. Server-only: reached from the API routes, never from the app bundle.
import postgres from 'postgres';

import type { Chain } from '@/lib/constants';
import type { Application, ApplyPlan, Template, TemplateStats, Trader } from '@/lib/types';

import type { FlashSvmIx } from './flash';

/** Solana material from a Flash quote: the two order messages to sign and the one-time setup instructions. */
export type PendingSvm = {
  orderMessage: string;
  nonce: string;
  deadline: string;
  bracketOrderMessage: string;
  bracketNonce: string;
  /** Token-account creation, then delegations (entry's spent asset, bracket's received asset), in that order. */
  setupIxs: FlashSvmIx[];
};

export type PendingQuote = {
  quoteId: string;
  chain: Chain;
  templateId: string;
  funder: string;
  body: Record<string, any>; // exact Flash quote request, re-used on submit
  bracket: { salt: string | null; deadline: string; signedMaxFromAmount: string } | null;
  // EIP-712 payloads from the quote, echoed back to Flash on submit.
  typed: {
    order: string | null;
    permit: string | null;
    bracketOrder: string | null;
    bracketPermit: string | null;
  };
  svm: PendingSvm | null;
  plan: ApplyPlan;
  createdAt: number;
};

/** Playbook's own account: owns the starter strategies (fees on them go to the Playbook integrator key). */
export const HOUSE = '0x0000000000000000000000000000000000000000';

export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const QUOTE_TTL_MS = 15 * 60_000;
const lc = (a: string) => a.toLowerCase();

// One pool per server process. Kept on globalThis so dev reloads of this module don't open new pools.
const g = globalThis as typeof globalThis & { __playbookSql?: postgres.Sql };
function sql() {
  if (g.__playbookSql) return g.__playbookSql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Server is missing DATABASE_URL (see .env.example)');
  g.__playbookSql = postgres(url, {
    ssl: 'require',
    // Works with Supabase's transaction pooler too, which doesn't support prepared statements.
    prepare: false,
    max: 5,
    idle_timeout: 30,
    onnotice: () => {},
    // snake_case columns <-> camelCase fields; JSON values (txs, quote bodies) are left untouched.
    transform: { column: { from: postgres.toCamel, to: postgres.fromCamel }, json: false, undefined: null },
  });
  return g.__playbookSql;
}

// Timestamps are timestamptz in Postgres and epoch milliseconds in the app.
type Row = Record<string, any>;
const ms = (d: unknown) => (d instanceof Date ? d.getTime() : Number(d));
const toTrader = (r: Row): Trader => ({
  address: r.address,
  name: r.name,
  handle: r.handle,
  bio: r.bio,
  avatar: r.avatar,
  createdAt: ms(r.createdAt),
  official: r.official || undefined,
});
const toTemplate = (r: Row): Template => ({
  id: r.id,
  creator: r.creator,
  name: r.name,
  description: r.description,
  entryOffsetPct: r.entryOffsetPct,
  takeProfitPct: r.takeProfitPct,
  stopLossPct: r.stopLossPct,
  cutPct: r.cutPct,
  chain: r.chain ?? 'both',
  entryType: r.entryType ?? (r.entryOffsetPct < 0 ? 'limit' : 'market'),
  twapMinutes: r.twapMinutes ?? null,
  twapSlices: r.twapSlices ?? null,
  entryExpiryHours: r.entryExpiryHours ?? null,
  bracketExpiryDays: r.bracketExpiryDays ?? null,
  maxSlippagePct: r.maxSlippagePct ?? null,
  createdAt: ms(r.createdAt),
});
const opt = <T>(v: T | null) => v ?? undefined;
const toApplication = (r: Row): Application => ({
  id: r.id,
  chain: r.chain,
  templateId: r.templateId,
  templateName: r.templateName,
  creator: r.creator,
  funder: r.funder,
  amountUsd: r.amountUsd,
  orderType: r.orderType,
  marketPriceAtApply: r.marketPriceAtApply,
  entryPrice: r.entryPrice,
  takeProfitPrice: r.takeProfitPrice,
  stopLossPrice: r.stopLossPrice,
  cutBps: r.cutBps,
  orderId: r.orderId,
  bracketOrderId: r.bracketOrderId,
  status: r.status,
  filledPrice: opt(r.filledPrice),
  exitPrice: opt(r.exitPrice),
  pnlUsd: opt(r.pnlUsd),
  creatorFeeUsd: r.creatorFeeUsd,
  txs: r.txs ?? [],
  closeReason: r.closeReason,
  closeOrderId: r.closeOrderId ?? null,
  boughtAmount: r.boughtAmount ?? null,
  spentUsd: r.spentUsd ?? null,
  createdAt: ms(r.createdAt),
  updatedAt: ms(r.updatedAt),
});

/** Columns an application update may change (everything else is fixed when the position is created). */
const APP_PATCHABLE = [
  'status',
  'filledPrice',
  'exitPrice',
  'pnlUsd',
  'bracketOrderId',
  'creatorFeeUsd',
  'txs',
  'closeReason',
  'closeOrderId',
  'boughtAmount',
  'spentUsd',
] as const satisfies readonly (keyof Application)[];

/** `funders`: the wallet's addresses on each network (its Base and Solana address). */
type AppFilter = { funders?: string[]; templateId?: string; creator?: string; limit?: number };

export const db = {
  // traders
  async getTrader(address: string) {
    const [r] = await sql()`select * from traders where address = ${lc(address)}`;
    return r ? toTrader(r) : null;
  },
  async getTraders(addresses: string[]) {
    if (!addresses.length) return new Map<string, Trader>();
    const rows = await sql()`select * from traders where address in ${sql()(addresses.map(lc))}`;
    return new Map(rows.map((r) => [r.address as string, toTrader(r)]));
  },
  async listTraders() {
    const rows = await sql()`select * from traders order by created_at`;
    return rows.map(toTrader);
  },
  async upsertTrader(t: Pick<Trader, 'address' | 'name' | 'handle' | 'bio' | 'avatar'>) {
    const [r] = await sql()`
      insert into traders (address, name, handle, bio, avatar)
      values (${lc(t.address)}, ${t.name}, ${t.handle}, ${t.bio}, ${t.avatar})
      on conflict (address) do update
        set name = excluded.name, handle = excluded.handle, bio = excluded.bio, avatar = excluded.avatar
      returning *`;
    return toTrader(r);
  },

  // templates
  async listTemplates(creator?: string) {
    const rows = creator
      ? await sql()`select * from templates where creator = ${lc(creator)} order by created_at desc`
      : await sql()`select * from templates order by created_at desc`;
    return rows.map(toTemplate);
  },
  async getTemplate(id: string) {
    const [r] = await sql()`select * from templates where id = ${id}`;
    return r ? toTemplate(r) : null;
  },
  async createTemplate(t: Omit<Template, 'id' | 'createdAt'>) {
    const [r] = await sql()`
      insert into templates ${sql()({ ...t, id: newId('tpl'), creator: lc(t.creator) })}
      returning *`;
    return toTemplate(r);
  },

  // applications (positions)
  async listApplications(f: AppFilter = {}) {
    const s = sql();
    // Base addresses match case-insensitively; Solana's base58 addresses are case-sensitive.
    const evm = (f.funders ?? []).filter((a) => a.startsWith('0x')).map(lc);
    const sol = (f.funders ?? []).filter((a) => !a.startsWith('0x'));
    const rows = await s`
      select * from applications
      where true
        ${f.funders ? s`and ((chain = 'base' and lower(funder) in ${s(evm.length ? evm : [''])})
                          or (chain = 'solana' and funder in ${s(sol.length ? sol : [''])}))` : s``}
        ${f.templateId ? s`and template_id = ${f.templateId}` : s``}
        ${f.creator ? s`and creator = ${lc(f.creator)}` : s``}
      order by created_at desc
      ${f.limit ? s`limit ${f.limit}` : s``}`;
    return rows.map(toApplication);
  },
  async getApplication(id: string) {
    const [r] = await sql()`select * from applications where id = ${id}`;
    return r ? toApplication(r) : null;
  },
  async addApplication(a: Application) {
    const { createdAt, updatedAt, txs, ...rest } = a;
    const [r] = await sql()`
      insert into applications ${sql()({
        ...rest,
        creator: lc(a.creator),
        txs: sql().json(txs),
        createdAt: new Date(createdAt),
        updatedAt: new Date(updatedAt),
      })}
      returning *`;
    return toApplication(r);
  },
  async updateApplication(id: string, patch: Partial<Application>) {
    const fields: Row = {};
    for (const k of APP_PATCHABLE) if (k in patch) fields[k] = k === 'txs' ? sql().json(patch.txs ?? []) : patch[k];
    if (!Object.keys(fields).length) return db.getApplication(id);
    const [r] = await sql()`
      update applications set ${sql()(fields)}, updated_at = now()
      where id = ${id}
      returning *`;
    return r ? toApplication(r) : null;
  },

  // pending quotes (so submit re-uses the exact server-built request: fee cannot be tampered with)
  async putQuote(q: PendingQuote) {
    const s = sql();
    await s`delete from quotes where created_at < ${new Date(Date.now() - QUOTE_TTL_MS)}`;
    await s`
      insert into quotes (quote_id, chain, template_id, funder, body, bracket, typed, svm, plan, created_at)
      values (${q.quoteId}, ${q.chain}, ${q.templateId}, ${q.funder}, ${s.json(q.body)},
              ${q.bracket ? s.json(q.bracket) : null}, ${s.json(q.typed)}, ${q.svm ? s.json(q.svm) : null},
              ${s.json(q.plan)}, ${new Date(q.createdAt)})
      on conflict (quote_id) do nothing`;
  },
  /** Reads a quote without using it up (the Solana setup step happens before submit). */
  async getQuote(quoteId: string): Promise<PendingQuote | null> {
    const [r] = await sql()`select * from quotes where quote_id = ${quoteId}`;
    if (!r || ms(r.createdAt) < Date.now() - QUOTE_TTL_MS) return null;
    return { ...(r as PendingQuote), createdAt: ms(r.createdAt) };
  },
  /** Removes and returns a quote, so each one can be submitted once. Expired quotes come back null. */
  async takeQuote(quoteId: string): Promise<PendingQuote | null> {
    const [r] = await sql()`delete from quotes where quote_id = ${quoteId} returning *`;
    if (!r || ms(r.createdAt) < Date.now() - QUOTE_TTL_MS) return null;
    return { ...(r as PendingQuote), createdAt: ms(r.createdAt) };
  },

  /** Applies, wins, losses, open positions and volume per playbook, in one query. */
  async statsFor(templateIds: string[]) {
    const stats = new Map<string, TemplateStats>();
    const empty = { applies: 0, wins: 0, losses: 0, open: 0, volumeUsd: 0, pnlUsd: 0, closedUsd: 0 };
    for (const id of templateIds) stats.set(id, { ...empty });
    if (!templateIds.length) return stats;
    const rows = await sql()`
      select template_id,
             count(*)::int                                                  as applies,
             count(*) filter (where status = 'take_profit')::int            as wins,
             count(*) filter (where status = 'stop_loss')::int              as losses,
             count(*) filter (where status in ('waiting', 'filled', 'closing'))::int as open,
             coalesce(sum(amount_usd), 0)::float8                           as volume_usd,
             coalesce(sum(pnl_usd) filter (where status in ('take_profit', 'stop_loss', 'closed')), 0)::float8    as pnl_usd,
             coalesce(sum(amount_usd) filter (where status in ('take_profit', 'stop_loss', 'closed')), 0)::float8 as closed_usd
      from applications
      where status <> 'failed' and template_id in ${sql()(templateIds)}
      group by template_id`;
    for (const r of rows) {
      stats.set(r.templateId, {
        applies: r.applies,
        wins: r.wins,
        losses: r.losses,
        open: r.open,
        volumeUsd: r.volumeUsd,
        pnlUsd: r.pnlUsd,
        closedUsd: r.closedUsd,
      });
    }
    return stats;
  },

  /** Creators with totals across their playbooks; `q` matches name or handle. House account excluded. */
  async searchTraders(q = '', limit = 50) {
    const s = sql();
    const like = `%${q.trim().toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const rows = await s`
      select t.*,
             count(distinct p.id)::int                                   as playbooks,
             count(a.id) filter (where a.status <> 'failed')::int        as applies,
             count(a.id) filter (where a.status = 'take_profit')::int    as wins,
             count(a.id) filter (where a.status = 'stop_loss')::int      as losses
      from traders t
      left join templates p on p.creator = t.address
      left join applications a on a.template_id = p.id
      where t.official is not true
        ${q.trim() ? s`and (lower(t.name) like ${like} or lower(t.handle) like ${like})` : s``}
      group by t.address
      order by count(a.id) filter (where a.status <> 'failed') desc, count(distinct p.id) desc, t.created_at desc
      limit ${limit}`;
    return rows.map((r) => ({ ...toTrader(r), playbooks: r.playbooks, applies: r.applies, wins: r.wins, losses: r.losses }));
  },

  /** Creator fees Flash reported on this creator's fills, and how many times their playbooks were applied. */
  async earningsFor(creator: string) {
    const [r] = await sql()`
      select coalesce(sum(creator_fee_usd), 0)::float8 as fees_usd, count(*)::int as applies
      from applications where creator = ${lc(creator)}`;
    return { feesUsd: r.feesUsd as number, applies: r.applies as number };
  },
};
