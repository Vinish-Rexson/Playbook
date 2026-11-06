import type { Earnings, Template, TemplateWithMeta } from '@/lib/types';

import { db, statsFor } from './db';

export const withMeta = (t: Template): TemplateWithMeta => ({
  ...t,
  trader: db.getTrader(t.creator),
  stats: statsFor(t.id),
});

export function earningsFor(creator: string): Earnings {
  const apps = db.listApplications((a) => a.creator.toLowerCase() === creator.toLowerCase());
  return {
    feesUsd: apps.reduce((s, a) => s + (a.creatorFeeUsd || 0), 0),
    applies: apps.length,
  };
}
