// Demo activity for the hosted database: creators, playbooks and a history of applied trades, so Discover,
// the leaderboard and creator pages look like a live community while friends test the app.
//
//   npm run seed:demo              add (or refresh) the demo data
//   npm run seed:demo -- --remove  delete every demo row
//
// Everything is tagged so it can be removed cleanly and never mixes with real data:
//   traders      addresses generated from a fixed seed (recomputed on --remove)
//   templates    id 'tpl_demo_…'
//   applications id 'pos_demo_…', order ids 'demo_ord_…' (they never reach Flash: nobody holds these wallets)
// The same seed always produces the same rows, so running it twice gives the same data.
try {
  process.loadEnvFile('.env');
} catch {
  // use the environment as is
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (.env).');
  process.exit(1);
}
const postgres = (await import('postgres')).default;
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false, max: 1, onnotice: () => {} });

// ---- deterministic randomness ----
let seed = 0x5eed1234;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a, b) => a + rand() * (b - a);
const int = (a, b) => Math.floor(between(a, b + 1));
const pickOne = (xs) => xs[Math.floor(rand() * xs.length)];
const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[int(0, 15)]).join('');
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58 = (n) => Array.from({ length: n }, () => B58[int(0, 57)]).join('');
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

const DAY = 86_400_000;
const NOW = Date.now();

// ---- creators ----
const CREATORS = [
  ['Aarav Mehta', 'aaravtrades', 'Swing trader. Buy the fear, sell the bounce.', 'sky'],
  ['Priya Nair', 'priya.eth', 'DeFi since 2020. Small size, tight stops.', 'rose'],
  ['Kabir Shah', 'kabir', 'Range trading on ETH. Patience pays.', 'mint'],
  ['Meera Iyer', 'meeraonchain', 'SOL maxi with a risk plan.', 'lime'],
  ['Rohan Desai', 'rohand', 'Momentum scalps, in and out within hours.', 'ink'],
  ['Ananya Rao', 'ananya', 'DCA everything. Sleep well.', 'sand'],
  ['Dev Malhotra', 'devm', 'Quant-ish. Rules over feelings.', 'sky'],
  ['Isha Kapoor', 'ishak', 'Mean reversion on majors.', 'mint'],
  ['Arjun Verma', 'arjunv', 'Breakout hunter. Cuts losers fast.', 'rose'],
  ['Sana Qureshi', 'sanaq', 'Weekend dips are my favourite entries.', 'lime'],
  ['Neel Joshi', 'neeljoshi', 'Low cut, high volume. Copy freely.', 'sand'],
  ['Tara Fernandes', 'tara.sol', 'Solana DCA bot, now as a playbook.', 'ink'],
].map(([name, handle, bio, avatar]) => ({ address: `0x${hex(40)}`, name, handle, bio, avatar }));

// ---- playbooks: [creator index, name, description, chain, entry, offset %, TP %, SL %, cut %, quality 0..1, extras] ----
const P = [
  [0, 'Fear Dip ETH', 'Buys ETH 3% under the market after a red day. Out at +6%.', 'base', 'limit', -3, 6, 3, 0.5, 0.68],
  [0, 'Weekly Bounce', 'Slow and steady: 5% dip, 10% target, wide stop.', 'base', 'limit', -5, 10, 5, 0.75, 0.62],
  [1, 'Tight Scalp', 'Market buy, +0.8% target, -0.5% stop. Many small wins.', 'base', 'market', 0, 0.8, 0.5, 0.3, 0.58],
  [1, 'Safe Harbor', 'Only buys a deep 7% flush. Rarely fills, usually wins.', 'base', 'limit', -7, 9, 4, 1, 0.74],
  [2, 'Range Grinder', 'Sideways market special: 1.5% dip, 3% target.', 'base', 'limit', -1.5, 3, 2, 0.4, 0.6],
  [3, 'SOL Sunrise', 'Buys SOL on a 2% dip, rides to +5%.', 'solana', 'limit', -2, 5, 3, 0.5, 0.64],
  [3, 'SOL Momentum', 'Market buy SOL, +4% target, -2.5% stop.', 'solana', 'market', 0, 4, 2.5, 0.6, 0.52],
  [4, 'Hourly Pop', 'Market in, +1.2% out. Built for volatile hours.', 'base', 'market', 0, 1.2, 0.9, 0.25, 0.55],
  [4, 'Breakout Chase', 'Buys strength, wide 5% stop, +8% target.', 'base', 'market', 0, 8, 5, 0.8, 0.47],
  [5, 'ETH Daily DCA', 'Spreads the buy over 4 hours in 12 slices.', 'base', 'twap', 0, 7, 6, 0.2, 0.61, { twap_minutes: 240, twap_slices: 12 }],
  [5, 'SOL Slow Stack', 'DCA into SOL over a day, +10% target.', 'solana', 'twap', 0, 10, 7, 0.2, 0.57, { twap_minutes: 1440, twap_slices: 24 }],
  [6, 'Volatility Fade', 'Fades sharp drops: 4% dip, +5% target, -3% stop.', 'base', 'limit', -4, 5, 3, 0.6, 0.66],
  [6, 'Quant Grid', 'Small dip, symmetric 2% / 2%. Pure statistics.', 'solana', 'limit', -1, 2, 2, 0.35, 0.53],
  [7, 'Mean Revert', 'Buys 2.5% under, sells at +3%. Works in chop.', 'base', 'limit', -2.5, 3, 2.5, 0.45, 0.63],
  [8, 'Breakout SOL', 'Market buy SOL breakouts. +6% or -3%.', 'solana', 'market', 0, 6, 3, 0.7, 0.5],
  [8, 'Fast Cut', 'Quick +2% target, stop at -1%. Losers die young.', 'base', 'market', 0, 2, 1, 0.5, 0.49],
  [9, 'Weekend Dip', 'Catches weekend flushes: 3.5% dip, +7%.', 'base', 'limit', -3.5, 7, 4, 0.55, 0.65],
  [9, 'SOL Weekend', 'Same idea on SOL: 4% dip, +8% target.', 'solana', 'limit', -4, 8, 4, 0.55, 0.6],
  [10, 'Zero Cut Scalp', 'No creator cut. +0.6% target, -0.4% stop.', 'base', 'market', 0, 0.6, 0.4, 0, 0.56],
  [10, 'Low Fee Swing', '0.1% cut, 2% dip, +4% target.', 'base', 'limit', -2, 4, 2.5, 0.1, 0.59],
  [11, 'SOL DCA Pro', 'Twelve slices over 2 hours, then +6% / -4%.', 'solana', 'twap', 0, 6, 4, 0.3, 0.6, { twap_minutes: 120, twap_slices: 12 }],
  [11, 'SOL Deep Value', 'Only buys SOL 8% down. Targets +15%.', 'solana', 'limit', -8, 15, 6, 1, 0.71],
];
const templates = P.map(([ci, name, description, chain, entry, off, tp, sl, cut, quality, extra], i) => ({
  id: `tpl_demo_${String(i + 1).padStart(2, '0')}`,
  creator: CREATORS[ci].address,
  name,
  description,
  chain,
  entry_type: entry,
  entry_offset_pct: off,
  take_profit_pct: tp,
  stop_loss_pct: sl,
  cut_pct: cut,
  twap_minutes: extra?.twap_minutes ?? null,
  twap_slices: extra?.twap_slices ?? null,
  entry_expiry_hours: entry === 'limit' ? pickOne([24, 72, 168]) : null,
  bracket_expiry_days: pickOne([7, 14, 30]),
  max_slippage_pct: null,
  // Older playbooks have had more time to collect trades.
  created_at: new Date(NOW - between(1, 45) * DAY),
  quality,
}));
// The starter playbooks get some history too (only demo rows are added to them).
const STARTERS = [
  { id: 'tpl_deepvalue', name: 'Deep Value', creator: '0x0000000000000000000000000000000000000000', chain: 'both', entry_type: 'limit', entry_offset_pct: -6, take_profit_pct: 12, stop_loss_pct: 5, cut_pct: 1, quality: 0.7, created_at: new Date(NOW - 50 * DAY) },
  { id: 'tpl_dipcatcher', name: 'Dip Catcher', creator: '0x0000000000000000000000000000000000000000', chain: 'both', entry_type: 'limit', entry_offset_pct: -2, take_profit_pct: 5, stop_loss_pct: 3, cut_pct: 0.5, quality: 0.6, created_at: new Date(NOW - 50 * DAY) },
  { id: 'tpl_quickscalp', name: 'Quick Scalp', creator: '0x0000000000000000000000000000000000000000', chain: 'both', entry_type: 'market', entry_offset_pct: 0, take_profit_pct: 0.3, stop_loss_pct: 0.3, cut_pct: 0.5, quality: 0.55, created_at: new Date(NOW - 50 * DAY) },
];

// ---- follower wallets that applied the playbooks ----
const evmWallets = Array.from({ length: 70 }, () => `0x${hex(40)}`);
const solWallets = Array.from({ length: 40 }, () => b58(44));

// Rough price paths for the last 45 days (enough for realistic entry prices).
const priceAt = (chain, t) => {
  const days = (NOW - t) / DAY;
  const base = chain === 'solana' ? 90 : 2240;
  return base * (1 + 0.06 * Math.sin(days / 4.3) + 0.03 * Math.sin(days / 1.7));
};

const apps = [];
let n = 0;
for (const t of [...templates, ...STARTERS]) {
  const ageDays = (NOW - t.created_at.getTime()) / DAY;
  // Popularity: better playbooks and older ones collect more applies (log-ish), plus noise.
  const count = Math.max(2, Math.round((4 + t.quality * 30) * Math.min(1, ageDays / 20) * between(0.5, 1.5)));
  for (let k = 0; k < count; k++) {
    n++;
    const chain = t.chain === 'both' ? (rand() < 0.7 ? 'base' : 'solana') : t.chain;
    const funder = chain === 'solana' ? pickOne(solWallets) : pickOne(evmWallets);
    const created = t.created_at.getTime() + rand() * (NOW - t.created_at.getTime());
    const recent = NOW - created < 2 * DAY;
    const market = priceAt(chain, created);
    const entry = round(market * (1 + t.entry_offset_pct / 100), chain === 'solana' ? 3 : 2);
    const tpPrice = round(entry * (1 + t.take_profit_pct / 100), chain === 'solana' ? 3 : 2);
    const slPrice = round(entry * (1 - t.stop_loss_pct / 100), chain === 'solana' ? 3 : 2);
    // Trade size: mostly small, a few big tickets.
    const amount = round(Math.min(800, Math.max(5, Math.exp(between(Math.log(8), Math.log(300))))), 2);

    let status;
    const r = rand();
    if (recent && r < 0.45) status = rand() < 0.65 ? 'filled' : 'waiting';
    else if (r < 0.05) status = 'cancelled';
    else if (r < 0.1) status = 'closed';
    else status = rand() < t.quality ? 'take_profit' : 'stop_loss';

    const fees = amount * 0.004 + amount * (t.cut_pct / 100); // network + Flash + creator cut, both legs
    let exit = null;
    let pnl = null;
    const filled = status === 'waiting' || status === 'cancelled' ? null : round(entry * between(0.998, 1.002), 2);
    if (status === 'take_profit') {
      exit = tpPrice;
      pnl = round(amount * (t.take_profit_pct / 100) - fees, 4);
    } else if (status === 'stop_loss') {
      exit = slPrice;
      pnl = round(-amount * (t.stop_loss_pct / 100) - fees, 4);
    } else if (status === 'closed') {
      const move = between(-t.stop_loss_pct, t.take_profit_pct);
      exit = round(entry * (1 + move / 100), 2);
      pnl = round((amount * move) / 100 - fees, 4);
    }
    const id = `pos_demo_${String(n).padStart(4, '0')}`;
    apps.push({
      id,
      template_id: t.id,
      template_name: t.name,
      creator: t.creator,
      funder,
      chain,
      amount_usd: amount,
      order_type: t.entry_type,
      market_price_at_apply: round(market, 2),
      entry_price: entry,
      take_profit_price: tpPrice,
      stop_loss_price: slPrice,
      cut_bps: Math.round(t.cut_pct * 100),
      order_id: `demo_ord_${randomUUIDFromRand()}`,
      bracket_order_id: status === 'waiting' || status === 'cancelled' ? null : `demo_ord_${randomUUIDFromRand()}`,
      status,
      filled_price: filled,
      exit_price: exit,
      pnl_usd: pnl,
      creator_fee_usd: filled ? round(amount * (t.cut_pct / 100), 4) : 0,
      txs: sql.json([]),
      close_reason: status === 'cancelled' ? 'REASON_USER_REQUESTED' : null,
      bought_amount: filled ? round(amount / filled, 8) : null,
      spent_usd: filled ? amount : null,
      created_at: new Date(created),
      updated_at: new Date(Math.min(NOW, created + between(0.1, 3) * DAY)),
    });
  }
}
// Seeded UUID-like ids (stable across runs).
function randomUUIDFromRand() {
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

async function remove(tx) {
  const a = await tx`delete from applications where id like 'pos_demo_%'`;
  const t = await tx`delete from templates where id like 'tpl_demo_%'`;
  const r = await tx`delete from traders where address in ${tx(CREATORS.map((c) => c.address))}`;
  return { applications: a.count, templates: t.count, traders: r.count };
}

try {
  if (process.argv.includes('--remove')) {
    const out = await sql.begin(remove);
    console.log('Removed demo data:', out);
  } else {
    const out = await sql.begin(async (tx) => {
      const removed = await remove(tx);
      await tx`insert into traders ${tx(CREATORS.map((c) => ({ ...c, official: false, created_at: new Date(NOW - 60 * DAY + rand() * 10 * DAY) })))}`;
      await tx`insert into templates ${tx(templates.map(({ quality: _q, ...t }) => t))}`;
      for (let i = 0; i < apps.length; i += 200) await tx`insert into applications ${tx(apps.slice(i, i + 200))}`;
      return removed;
    });
    const by = (s) => apps.filter((a) => a.status === s).length;
    console.log(`Replaced ${out.applications} old demo rows.`);
    console.log(`Added ${CREATORS.length} creators, ${templates.length} playbooks, ${apps.length} applied trades`);
    console.log(`  wins ${by('take_profit')}, stops ${by('stop_loss')}, closed ${by('closed')}, open ${by('filled') + by('waiting')}, cancelled ${by('cancelled')}`);
    console.log(`  volume $${Math.round(apps.reduce((s, a) => s + a.amount_usd, 0)).toLocaleString('en-US')}`);
  }
} finally {
  await sql.end();
}
