import { db } from '@/server/db';
import { fail, ok } from '@/server/http';
import { refresh } from '@/server/positions';

/** GET /api/positions/:id → one position, refreshed from Flash (detail page). */
export async function GET(_request: Request, { id }: Record<string, string>) {
  try {
    const app = await db.getApplication(id);
    if (!app) return Response.json({ error: 'Position not found' }, { status: 404 });
    return ok({ position: await refresh(app) });
  } catch (e) {
    return fail(e);
  }
}
