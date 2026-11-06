import type { Earnings, Template, TemplateWithMeta } from '@/lib/types';

import { db } from './db';

/** Adds each playbook's creator profile and stats, using two queries for the whole list. */
export async function withMeta(templates: Template[]): Promise<TemplateWithMeta[]> {
  const [traders, stats] = await Promise.all([
    db.getTraders([...new Set(templates.map((t) => t.creator))]),
    db.statsFor(templates.map((t) => t.id)),
  ]);
  return templates.map((t) => ({
    ...t,
    trader: traders.get(t.creator.toLowerCase()) ?? null,
    stats: stats.get(t.id)!,
  }));
}

export const withMetaOne = async (t: Template) => (await withMeta([t]))[0];

export const earningsFor = (creator: string): Promise<Earnings> => db.earningsFor(creator);
