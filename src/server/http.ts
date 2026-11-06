import { FlashError } from './flash';

export const ok = (data: unknown, init?: ResponseInit) => Response.json(data, init);

export function fail(e: unknown) {
  if (e instanceof FlashError) {
    console.warn('[flash]', e.status, e.code, e.message);
    return Response.json(
      { error: `Flash: ${e.message}`, code: e.code, details: e.details ?? null },
      { status: e.status >= 500 ? 502 : e.status },
    );
  }
  const message = e instanceof Error ? e.message : String(e);
  console.warn('[api]', message);
  return Response.json({ error: message }, { status: 400 });
}

export const isAddress = (a: unknown): a is string => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
