import { db } from '@/server/db';
import { fail, ok } from '@/server/http';
import { earningsFor, withMeta } from '@/server/meta';

export function GET(_request: Request, { address }: Record<string, string>) {
  try {
    const trader = db.getTrader(address);
    const templates = db
      .listTemplates()
      .filter((t) => t.creator.toLowerCase() === address.toLowerCase())
      .map(withMeta);
    const recent = db
      .listApplications((a) => a.creator.toLowerCase() === address.toLowerCase())
      .slice(0, 10);
    return ok({ trader, templates, earnings: earningsFor(address), recent });
  } catch (e) {
    return fail(e);
  }
}
