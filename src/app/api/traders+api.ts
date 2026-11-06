import { db } from '@/server/db';
import { fail, isAddress, ok } from '@/server/http';

export function GET() {
  return ok({ traders: db.listTraders() });
}

/** Create or update a trader profile. No verification by design: the template stats speak. */
export async function POST(request: Request) {
  try {
    const b = await request.json();
    if (!isAddress(b.address)) throw new Error('A wallet address is required');
    const name = String(b.name ?? '').trim().slice(0, 40);
    if (name.length < 2) throw new Error('Pick a display name (2+ characters)');
    const handle = String(b.handle ?? name)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 20);
    const trader = db.upsertTrader({
      address: b.address,
      name,
      handle: handle || 'trader',
      bio: String(b.bio ?? '').trim().slice(0, 140),
      avatar: String(b.avatar ?? '🦊').slice(0, 4),
    });
    return ok({ trader });
  } catch (e) {
    return fail(e);
  }
}
