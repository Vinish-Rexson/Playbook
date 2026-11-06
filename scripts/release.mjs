// Builds a signed Android release APK and publishes it for friends to install and update.
//
//   npm run release                         bump the version, build, upload, publish latest.json
//   npm run release -- --notes "Fixed X"    same, with a note shown in the app's update banner
//   npm run release -- --upload-only        upload the APK already built (no bump, no build)
//
// Needs in .env: PLAYBOOK_API_ORIGIN (the Vercel URL), SUPABASE_URL, SUPABASE_SECRET_KEY.
// The signing key is created on the first run at ~/.playbook/playbook-release.jks (password saved to .env as
// PLAYBOOK_KEYSTORE_PASSWORD). Back both up: an APK signed with a different key cannot update the app.
//
// Published to the public Supabase Storage bucket "releases":
//   playbook.apk                      always the newest build (the link to share)
//   playbook-<version>-<code>.apk     each build (the 2 newest are kept)
//   latest.json                       what the app reads to offer "Update available"
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const envFile = path.join(root, '.env');
const appJsonPath = path.join(root, 'app.json');
const apkPath = path.join(root, 'android/app/build/outputs/apk/release/app-release.apk');
const BUCKET = 'releases';
const MAX_BYTES = 50 * 1024 * 1024; // Supabase free plan upload limit
const KEEP = 2;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};
const step = (msg) => console.log(`\n▸ ${msg}`);
const win = process.platform === 'win32';

try {
  process.loadEnvFile(envFile);
} catch {
  // No .env: use the environment as is.
}

const origin = process.env.PLAYBOOK_API_ORIGIN?.trim().replace(/\/$/, '');
const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
const secret = process.env.SUPABASE_SECRET_KEY?.trim();
if (!origin || !/^https:\/\//.test(origin)) fail('Set PLAYBOOK_API_ORIGIN in .env to your Vercel URL (https://...).');
if (!supabaseUrl || !secret) fail('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env.');

// 1. The app this builds will talk to the hosted API, so make sure it answers first.
step(`Checking the API at ${origin}`);
try {
  const r = await fetch(`${origin}/api/price?chain=base`, { signal: AbortSignal.timeout(30_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !(j.price > 0)) fail(`The API answered ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  console.log(`  ok, ETH $${Number(j.price).toFixed(2)}${j.devKey ? ' (Flash dev key: set FLASH_API_KEY on Vercel)' : ''}`);
} catch (e) {
  fail(`Could not reach ${origin}: ${e.message}`);
}

const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));
const original = JSON.stringify(appJson, null, 2) + '\n';
let { version } = appJson.expo;
let versionCode = appJson.expo.android?.versionCode ?? 1;

if (!flag('--upload-only')) {
  // 2. Signing key, created once.
  const keystore = process.env.PLAYBOOK_KEYSTORE?.trim() || path.join(homedir(), '.playbook', 'playbook-release.jks');
  let password = process.env.PLAYBOOK_KEYSTORE_PASSWORD?.trim();
  if (!existsSync(keystore)) {
    if (password) fail(`PLAYBOOK_KEYSTORE_PASSWORD is set but ${keystore} is missing. Restore the keystore from your backup.`);
    step(`Creating the release signing key at ${keystore}`);
    password = randomBytes(16).toString('hex');
    mkdirSync(path.dirname(keystore), { recursive: true });
    const keytool = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', win ? 'keytool.exe' : 'keytool') : 'keytool';
    const r = spawnSync(
      keytool,
      ['-genkeypair', '-v', '-storetype', 'PKCS12', '-keystore', keystore, '-alias', 'playbook', '-keyalg', 'RSA', '-keysize', '2048',
        '-validity', '10000', '-storepass', password, '-keypass', password, '-dname', 'CN=Playbook, O=Playbook, C=IN'],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    );
    if (r.status !== 0) fail('keytool failed. Is JAVA_HOME set (Android Studio\'s jbr folder)?');
    appendFileSync(envFile, `\n# Release signing key password (keystore: ${keystore}). Back up both.\nPLAYBOOK_KEYSTORE_PASSWORD=${password}\n`);
    console.log('  created. Back up the .jks file and PLAYBOOK_KEYSTORE_PASSWORD from .env somewhere safe.');
  }
  if (!password) fail('PLAYBOOK_KEYSTORE_PASSWORD is missing from .env.');

  // 3. Bump the version: versionCode always, the patch number unless --version is given.
  versionCode += 1;
  const [maj, min, patch] = version.split('.').map(Number);
  version = option('--version') ?? `${maj}.${min}.${(patch || 0) + 1}`;
  appJson.expo.version = version;
  appJson.expo.android = { ...appJson.expo.android, versionCode };
  writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
  console.log(`\n  version ${version} (code ${versionCode})`);

  const run = (cmd, argv, cwd = root) => {
    const r = spawnSync(cmd, argv, { cwd, stdio: 'inherit', shell: win, env: process.env });
    if (r.status !== 0) {
      writeFileSync(appJsonPath, original);
      fail(`${cmd} ${argv[0]} failed. The version bump was undone.`);
    }
  };

  // 4. Regenerate android/ from app.json, then build one arm64 APK (what phones from the last 8+ years run).
  step('Generating the native project');
  run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install']);
  step('Building the release APK (several minutes)');
  run(win ? 'gradlew.bat' : './gradlew', [
    'assembleRelease',
    '-PreactNativeArchitectures=arm64-v8a',
    `-Pandroid.injected.signing.store.file=${keystore}`,
    `-Pandroid.injected.signing.store.password=${password}`,
    '-Pandroid.injected.signing.key.alias=playbook',
    `-Pandroid.injected.signing.key.password=${password}`,
  ], path.join(root, 'android'));
}

// 5. Upload.
if (!existsSync(apkPath)) fail(`No APK at ${apkPath}. Run without --upload-only to build it.`);
const size = statSync(apkPath).size;
console.log(`\n  APK ${(size / 1024 / 1024).toFixed(1)} MB`);
if (size > MAX_BYTES) fail('The APK is over Supabase\'s 50 MB upload limit.');

const storage = `${supabaseUrl}/storage/v1`;
const auth = { apikey: secret, authorization: `Bearer ${secret}` };
async function call(method, url, body, headers = {}) {
  const r = await fetch(url, { method, headers: { ...auth, ...headers }, body });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${url.replace(storage, '')} → ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const upload = (name, body, type, cache) =>
  call('POST', `${storage}/object/${BUCKET}/${name}`, body, { 'content-type': type, 'cache-control': `max-age=${cache}`, 'x-upsert': 'true' });
const publicUrl = (name) => `${storage}/object/public/${BUCKET}/${name}`;

try {
  step('Uploading to Supabase Storage');
  const buckets = await call('GET', `${storage}/bucket`);
  if (!buckets.some((b) => b.id === BUCKET)) {
    await call('POST', `${storage}/bucket`, JSON.stringify({ id: BUCKET, name: BUCKET, public: true }), { 'content-type': 'application/json' });
    console.log(`  created the public bucket "${BUCKET}"`);
  }
  const apk = readFileSync(apkPath);
  const type = 'application/vnd.android.package-archive';
  const file = `playbook-${version}-${versionCode}.apk`;
  await upload(file, apk, type, 31536000);
  await upload('playbook.apk', apk, type, 60);
  const latest = {
    version,
    versionCode,
    url: publicUrl(file),
    notes: option('--notes') ?? '',
    sizeMb: Number((size / 1024 / 1024).toFixed(1)),
    publishedAt: new Date().toISOString(),
  };
  await upload('latest.json', JSON.stringify(latest, null, 2), 'application/json', 60);

  // Keep the newest builds only (free plan storage is 1 GB).
  const objects = await call('POST', `${storage}/object/list/${BUCKET}`, JSON.stringify({ prefix: '', limit: 1000 }), { 'content-type': 'application/json' });
  const old = objects
    .map((o) => ({ name: o.name, code: Number(/^playbook-.+-(\d+)\.apk$/.exec(o.name)?.[1]) }))
    .filter((o) => o.code > 0)
    .sort((a, b) => b.code - a.code)
    .slice(KEEP)
    .map((o) => o.name);
  if (old.length) await call('DELETE', `${storage}/object/${BUCKET}`, JSON.stringify({ prefixes: old }), { 'content-type': 'application/json' });

  console.log(`\n✔ Released ${version} (code ${versionCode})`);
  console.log(`  Share this link: ${publicUrl('playbook.apk')}`);
  console.log('  Installed apps see "Update available" within a minute.');
} catch (e) {
  fail(`Upload failed: ${e.message}${flag('--upload-only') ? '' : '\n  The APK is built: retry with `npm run release -- --upload-only`.'}`);
}
