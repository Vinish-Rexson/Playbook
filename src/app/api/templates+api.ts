import { MAX_CUT_PCT } from '@/lib/constants';
import { db, HOUSE } from '@/server/db';
import { fail, isAddress, ok } from '@/server/http';
import { withMeta } from '@/server/meta';

export function GET() {
  const templates = db.listTemplates().map(withMeta);
  // Most-applied first, newest breaks ties.
  templates.sort((a, b) => b.stats.applies - a.stats.applies || b.createdAt - a.createdAt);
  return ok({ templates });
}

const clamp = (n: unknown, min: number, max: number, label: string) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return Math.round(v * 100) / 100;
};

export async function POST(request: Request) {
  try {
    const b = await request.json();
    if (!isAddress(b.creator)) throw new Error('Connect a wallet first');
    if (b.creator.toLowerCase() === HOUSE) throw new Error('That address is reserved');
    if (!db.getTrader(b.creator)) throw new Error('Create your trader profile first');
    const name = String(b.name ?? '').trim().slice(0, 32);
    if (name.length < 3) throw new Error('Name your playbook (3+ characters)');
    const template = db.createTemplate({
      creator: b.creator,
      name,
      description: String(b.description ?? '').trim().slice(0, 200),
      entryOffsetPct: -clamp(Math.abs(Number(b.entryOffsetPct ?? 0)), 0, 20, 'Entry dip'),
      takeProfitPct: clamp(b.takeProfitPct, 0.1, 100, 'Take profit'),
      // Stop-loss is mandatory: every playbook protects the people who apply it.
      stopLossPct: clamp(b.stopLossPct, 0.1, 50, 'Stop-loss'),
      cutPct: clamp(b.cutPct, 0, MAX_CUT_PCT, 'Creator cut'),
    });
    return ok({ template: withMeta(template) });
  } catch (e) {
    return fail(e);
  }
}
