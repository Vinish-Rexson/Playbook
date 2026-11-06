/// <reference types="node" />
// Tiny JSON-file store for the hackathon. Lives in ./data (git-ignored).
// Swap for Supabase/Postgres before deploying the API routes to a serverless host.
import fs from 'node:fs';
import path from 'node:path';

import type { Application, Template, TemplateStats, Trader } from '@/lib/types';

export type PendingQuote = {
  quoteId: string;
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
  plan: import('@/lib/types').ApplyPlan;
  createdAt: number;
};

type DB = {
  traders: Record<string, Trader>;
  templates: Template[];
  applications: Application[];
  quotes: Record<string, PendingQuote>;
};

const FILE = path.join(process.cwd(), 'data', 'playbook-db.json');
let cache: DB | null = null;

const key = (address: string) => address.toLowerCase();
export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Playbook's own account: owns the starter strategies (fees on them go to the Playbook integrator key). */
export const HOUSE = '0x0000000000000000000000000000000000000000';

const houseTrader = (): Trader => ({
  address: HOUSE,
  name: 'Playbook',
  handle: 'playbook',
  bio: 'Starter strategies from the Playbook team. Publish your own from the Create tab.',
  avatar: '📘',
  createdAt: Date.now(),
  official: true,
});

function starterTemplates(): Template[] {
  const now = Date.now();
  return [
    { id: 'tpl_quickscalp', creator: HOUSE, name: 'Quick Scalp', description: 'Buys now, takes profit on a 0.3% move, cuts the loss at 0.3%. Fast in, fast out.', entryOffsetPct: 0, takeProfitPct: 0.3, stopLossPct: 0.3, cutPct: 0.5, createdAt: now - 4 },
    { id: 'tpl_dipcatcher', creator: HOUSE, name: 'Dip Catcher', description: 'Waits for a 2% dip, then rides the bounce to +5%. Stop at -3% keeps losses small.', entryOffsetPct: -2, takeProfitPct: 5, stopLossPct: 3, cutPct: 0.5, createdAt: now - 3 },
    { id: 'tpl_rangerider', creator: HOUSE, name: 'Range Rider', description: 'Small dip, small target. Designed to hit often in sideways markets.', entryOffsetPct: -1, takeProfitPct: 2.5, stopLossPct: 1.5, cutPct: 0.3, createdAt: now - 2 },
    { id: 'tpl_deepvalue', creator: HOUSE, name: 'Deep Value', description: 'Only buys a real flush: 6% below today. Targets a 12% recovery.', entryOffsetPct: -6, takeProfitPct: 12, stopLossPct: 5, cutPct: 1, createdAt: now - 1 },
  ];
}

function seed(): DB {
  return { traders: { [key(HOUSE)]: houseTrader() }, templates: starterTemplates(), applications: [], quotes: {} };
}

/** Older data files had demo traders with made-up addresses and simulated (paper) trades: drop both. */
function migrate(d: DB & { traders: Record<string, Trader & { demo?: boolean }> }) {
  let changed = false;
  const demo = new Set(Object.values(d.traders).filter((t) => t.demo).map((t) => key(t.address)));
  if (demo.size) {
    for (const k of demo) delete d.traders[k];
    for (const t of d.templates) if (demo.has(key(t.creator))) t.creator = HOUSE;
    changed = true;
  }
  if (!d.traders[key(HOUSE)]) {
    d.traders[key(HOUSE)] = houseTrader();
    changed = true;
  }
  const before = d.applications.length;
  d.applications = d.applications.filter((a) => (a as { mode?: string }).mode !== 'paper' && !a.orderId.startsWith('paper'));
  for (const a of d.applications) delete (a as { mode?: string }).mode;
  if (d.applications.length !== before) changed = true;
  for (const [id, q] of Object.entries(d.quotes)) {
    if ((q as { mode?: string }).mode === 'paper') {
      delete d.quotes[id];
      changed = true;
    }
  }
  return changed;
}

function load(): DB {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8')) as DB;
    cache.quotes ??= {};
    if (migrate(cache)) save();
  } catch {
    cache = seed();
    save();
  }
  return cache;
}

function save() {
  if (!cache) return;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2));
}

export const db = {
  // traders
  getTrader: (address: string) => load().traders[key(address)] ?? null,
  listTraders: () => Object.values(load().traders),
  upsertTrader(t: Omit<Trader, 'createdAt'> & { createdAt?: number }) {
    const d = load();
    const existing = d.traders[key(t.address)];
    d.traders[key(t.address)] = { ...existing, ...t, createdAt: existing?.createdAt ?? Date.now() };
    save();
    return d.traders[key(t.address)];
  },

  // templates
  listTemplates: () => [...load().templates].sort((a, b) => b.createdAt - a.createdAt),
  getTemplate: (id: string) => load().templates.find((t) => t.id === id) ?? null,
  createTemplate(t: Omit<Template, 'id' | 'createdAt'>) {
    const d = load();
    const tpl: Template = { ...t, id: newId('tpl'), createdAt: Date.now() };
    d.templates.push(tpl);
    save();
    return tpl;
  },

  // applications
  listApplications: (filter: (a: Application) => boolean = () => true) =>
    load().applications.filter(filter).sort((a, b) => b.createdAt - a.createdAt),
  getApplication: (id: string) => load().applications.find((a) => a.id === id) ?? null,
  addApplication(a: Application) {
    load().applications.push(a);
    save();
    return a;
  },
  updateApplication(id: string, patch: Partial<Application>) {
    const d = load();
    const i = d.applications.findIndex((a) => a.id === id);
    if (i < 0) return null;
    d.applications[i] = { ...d.applications[i], ...patch, updatedAt: Date.now() };
    save();
    return d.applications[i];
  },

  // pending quotes (so submit re-uses the exact server-built request: fee cannot be tampered with)
  putQuote(q: PendingQuote) {
    const d = load();
    const cutoff = Date.now() - 15 * 60_000;
    for (const [id, old] of Object.entries(d.quotes)) if (old.createdAt < cutoff) delete d.quotes[id];
    d.quotes[q.quoteId] = q;
    save();
  },
  takeQuote(quoteId: string) {
    const d = load();
    const q = d.quotes[quoteId] ?? null;
    if (q) {
      delete d.quotes[quoteId];
      save();
    }
    return q;
  },
};

export function statsFor(templateId: string): TemplateStats {
  const apps = db.listApplications((a) => a.templateId === templateId && a.status !== 'failed');
  return {
    applies: apps.length,
    wins: apps.filter((a) => a.status === 'take_profit').length,
    losses: apps.filter((a) => a.status === 'stop_loss').length,
    open: apps.filter((a) => a.status === 'waiting' || a.status === 'filled').length,
    volumeUsd: apps.reduce((s, a) => s + a.amountUsd, 0),
  };
}
