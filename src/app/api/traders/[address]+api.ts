import { db } from '@/server/db';
import { fail, ok } from '@/server/http';
import { earningsFor, withMeta } from '@/server/meta';

export async function GET(_request: Request, { address }: Record<string, string>) {
  try {
    const [trader, templates, earnings, recent] = await Promise.all([
      db.getTrader(address),
      db.listTemplates(address).then(withMeta),
      earningsFor(address),
      db.listApplications({ creator: address, limit: 10 }),
    ]);
    return ok({ trader, templates, earnings, recent });
  } catch (e) {
    return fail(e);
  }
}
