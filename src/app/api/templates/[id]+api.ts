import { db } from '@/server/db';
import { fail, ok } from '@/server/http';
import { withMetaOne } from '@/server/meta';

export async function GET(_request: Request, { id }: Record<string, string>) {
  try {
    const t = await db.getTemplate(id);
    if (!t) return Response.json({ error: 'Playbook not found' }, { status: 404 });
    const [template, recent] = await Promise.all([withMetaOne(t), db.listApplications({ templateId: id, limit: 8 })]);
    return ok({ template, recent });
  } catch (e) {
    return fail(e);
  }
}
