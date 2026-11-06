// Applies supabase/migrations to the Supabase database in DATABASE_URL using the Supabase CLI.
// Only migrations not yet recorded in the database's migration history run.
//
//   npm run db:push            apply new migrations
//   npm run db:push -- --dry-run   list what would run
import { spawnSync } from 'node:child_process';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env: fall back to the environment (e.g. CI secrets).
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Add it to .env (see .env.example).');
  process.exit(1);
}

// The CLI asks before changing the hosted database; pass `-- --yes` to skip that.
const r = spawnSync('npx', ['supabase', 'db', 'push', `--remote=${url}`, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);
