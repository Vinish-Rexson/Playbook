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
  mode: 'live' | 'paper';
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

function seed(): DB {
  const now = Date.now();
  const riya = '0x5ea1ab2f7a3c1d9e0b6c4a8f2e1d7b3c9a0f1e2d';
  const arjun = '0x9b3c7d1e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b1c';
  const meera = '0x2f8e6d4c2b0a8f6e4d2c0b8a6f4e2d0c8b6a4f2e';
  const traders: DB['traders'] = {
    [key(riya)]: { address: riya, name: 'Riya Sharma', handle: 'riya', bio: 'Scalps ETH on the 15m. Tight stops, quick exits.', avatar: '🦊', createdAt: now - 9 * 864e5, demo: true },
    [key(arjun)]: { address: arjun, name: 'Arjun K', handle: 'arjunk', bio: 'Patient dip buyer. Waits for blood, sells into strength.', avatar: '🐋', createdAt: now - 21 * 864e5, demo: true },
    [key(meera)]: { address: meera, name: 'Meera Iyer', handle: 'meera', bio: 'Range trader. Small wins, every day.', avatar: '🦉', createdAt: now - 4 * 864e5, demo: true },
  };
  const templates: Template[] = [
    { id: 'tpl_quickscalp', creator: riya, name: 'Quick Scalp', description: 'Buys now, takes profit on a 0.3% move, cuts the loss at 0.3%. Built for fast demos and quick flips.', entryOffsetPct: 0, takeProfitPct: 0.3, stopLossPct: 0.3, cutPct: 0.5, createdAt: now - 2 * 864e5 },
    { id: 'tpl_dipcatcher', creator: riya, name: 'Dip Catcher', description: 'Waits for a 2% dip, then rides the bounce to +5%. Stop at -3% keeps losses small.', entryOffsetPct: -2, takeProfitPct: 5, stopLossPct: 3, cutPct: 0.5, createdAt: now - 6 * 864e5 },
    { id: 'tpl_deepvalue', creator: arjun, name: 'Deep Value', description: 'Only buys a real flush: 6% below today. Targets a 12% recovery.', entryOffsetPct: -6, takeProfitPct: 12, stopLossPct: 5, cutPct: 1, createdAt: now - 12 * 864e5 },
    { id: 'tpl_rangerider', creator: meera, name: 'Range Rider', description: 'Small dip, small target. Designed to hit often in sideways markets.', entryOffsetPct: -1, takeProfitPct: 2.5, stopLossPct: 1.5, cutPct: 0.3, createdAt: now - 3 * 864e5 },
  ];
  return { traders, templates, applications: [], quotes: {} };
}

function load(): DB {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8')) as DB;
    cache.quotes ??= {};
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
