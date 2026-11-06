import { db } from '@/server/db';
import { fail, isAddress, ok } from '@/server/http';
import { refresh } from '@/server/positions';

/** A wallet's positions, refreshed from Flash on every poll. */
export async function GET(request: Request) {
  try {
    const address = new URL(request.url).searchParams.get('address');
    if (!isAddress(address)) throw new Error('address is required');
    const apps = db.listApplications((a) => a.funder.toLowerCase() === address.toLowerCase());
    const positions = await Promise.all(apps.map(refresh));
    return ok({ positions });
  } catch (e) {
    return fail(e);
  }
}
