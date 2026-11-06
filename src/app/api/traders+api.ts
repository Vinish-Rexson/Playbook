import { db, HOUSE } from '@/server/db';
import { fail, isAddress, ok } from '@/server/http';

export async function GET() {
  try {
    return ok({ traders: await db.listTraders() });
  } catch (e) {
    return fail(e);
  }
}

/** Create or update a trader profile. No verification by design: the template stats speak. */
export async function POST(request: Request) {
  try {
    const b = await request.json();
    if (!isAddress(b.address)) throw new Error('A wallet address is required');
    if (b.address.toLowerCase() === HOUSE) throw new Error('That address is reserved');
    const name = String(b.name ?? '').trim().slice(0, 40);
    if (name.length < 2) throw new Error('Pick a display name (2+ characters)');
    const handle = String(b.handle ?? name)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 20);
    const trader = await db.upsertTrader({
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
