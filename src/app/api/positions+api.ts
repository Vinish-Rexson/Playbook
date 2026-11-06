import { db } from '@/server/db';
import { fail, isAddress, ok } from '@/server/http';
import { refresh } from '@/server/positions';
import { isSolanaAddress } from '@/wallet/solanaKeys';

/** A wallet's positions on every network, refreshed from Flash on each poll. ?address=<base>&address=<solana> */
export async function GET(request: Request) {
  try {
    const addresses = new URL(request.url).searchParams.getAll('address').filter(Boolean);
    if (!addresses.length) throw new Error('address is required');
    for (const a of addresses) if (!isAddress(a) && !isSolanaAddress(a)) throw new Error(`Not a wallet address: ${a}`);
    const apps = await db.listApplications({ funders: addresses });
    const positions = await Promise.all(apps.map(refresh));
    return ok({ positions });
  } catch (e) {
    return fail(e);
  }
}
