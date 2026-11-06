import { db } from '@/server/db';
import { fail, ok } from '@/server/http';
import { withMeta } from '@/server/meta';

export function GET(_request: Request, { id }: Record<string, string>) {
  try {
    const t = db.getTemplate(id);
    if (!t) return Response.json({ error: 'Playbook not found' }, { status: 404 });
    const recent = db.listApplications((a) => a.templateId === id).slice(0, 8);
    return ok({ template: withMeta(t), recent });
  } catch (e) {
    return fail(e);
  }
}
