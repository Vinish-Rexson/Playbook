import { MAX_CUT_PCT, type PlaybookNetwork } from '@/lib/constants';
import type { EntryType, OrderOptions } from '@/lib/types';
import { db, HOUSE } from '@/server/db';
import { fail, isAddress, ok } from '@/server/http';
import { assertOwner } from '@/server/ownership';
import { withMeta, withMetaOne } from '@/server/meta';

export async function GET() {
  try {
    const templates = await withMeta(await db.listTemplates());
    // Most-applied first, newest breaks ties.
    templates.sort((a, b) => b.stats.applies - a.stats.applies || b.createdAt - a.createdAt);
    return ok({ templates });
  } catch (e) {
    return fail(e);
  }
}

/** New playbooks trade on one network ('both' only exists on the original starter playbooks). */
function parseNetwork(v: unknown): PlaybookNetwork {
  if (v === undefined || v === null || v === '') return 'base';
  if (v === 'base' || v === 'solana') return v;
  throw new Error('Pick Base or Solana');
}

const clamp = (n: unknown, min: number, max: number, label: string) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return Math.round(v * 100) / 100;
};

const optionalInt = (n: unknown, min: number, max: number, label: string) =>
  n === undefined || n === null || n === '' ? null : Math.round(clamp(n, min, max, label));

/** Flash order options (Placing Orders docs). Each only applies to the entry type it belongs to. */
function parseOptions(b: Record<string, unknown>, dip: number): OrderOptions {
  const requested = b.entryType ?? (dip > 0 ? 'limit' : 'market');
  if (requested !== 'market' && requested !== 'limit' && requested !== 'twap') throw new Error('Unknown entry type');
  // A limit buy needs a dip below the price; without one it is a market buy.
  const entryType: EntryType = requested === 'limit' && dip === 0 ? 'market' : requested;
  return {
    entryType,
    // TWAP: at least 5 minutes (Flash minimum), up to a week; 2–2560 slices, at most one per minute.
    twapMinutes: entryType === 'twap' ? Math.round(clamp(b.twapMinutes ?? 60, 5, 10080, 'DCA duration (minutes)')) : null,
    twapSlices:
      entryType === 'twap'
        ? Math.round(clamp(b.twapSlices ?? 6, 2, Math.min(2560, Number(b.twapMinutes ?? 60)), 'DCA slices'))
        : null,
    entryExpiryHours: entryType === 'limit' ? optionalInt(b.entryExpiryHours, 1, 8760, 'Buy expiry (hours)') : null,
    bracketExpiryDays: optionalInt(b.bracketExpiryDays, 1, 365, 'Protection expiry (days)'),
    maxSlippagePct: entryType === 'market' && b.maxSlippagePct != null && b.maxSlippagePct !== '' ? clamp(b.maxSlippagePct, 0.1, 10, 'Max slippage') : null,
  };
}

export async function POST(request: Request) {
  try {
    const b = await request.json();
    if (!isAddress(b.creator)) throw new Error('Connect a wallet first');
    if (b.creator.toLowerCase() === HOUSE) throw new Error('That address is reserved');
    if (!(await db.getTrader(b.creator))) throw new Error('Create your trader profile first');
    await assertOwner('Publish playbook', b.creator, b.proof);
    const name = String(b.name ?? '').trim().slice(0, 32);
    if (name.length < 3) throw new Error('Name your playbook (3+ characters)');
    const dip = clamp(Math.abs(Number(b.entryOffsetPct ?? 0)), 0, 20, 'Entry dip');
    const options = parseOptions(b, dip);
    const template = await db.createTemplate({
      creator: b.creator,
      name,
      description: String(b.description ?? '').trim().slice(0, 200),
      entryOffsetPct: options.entryType === 'market' ? 0 : -dip,
      takeProfitPct: clamp(b.takeProfitPct, 0.1, 100, 'Take profit'),
      // Stop-loss is mandatory: every playbook protects the people who apply it.
      stopLossPct: clamp(b.stopLossPct, 0.1, 50, 'Stop-loss'),
      cutPct: clamp(b.cutPct, 0, MAX_CUT_PCT, 'Creator cut'),
      chain: parseNetwork(b.chain),
      ...options,
    });
    return ok({ template: await withMetaOne(template) });
  } catch (e) {
    return fail(e);
  }
}
