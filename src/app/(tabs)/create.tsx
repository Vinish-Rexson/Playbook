// Create: profile first (once), then a playbook built on the chart. Buy, take profit and stop are three
// independent levels: moving one (by dragging it on the chart or with + / −) never moves the others.
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronDown, ChevronUp, Info, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { TradeChart, type Level, type LevelKey } from '@/components/charts/TradeChart';
import { NetworkSwitch } from '@/components/NetworkSwitch';
import { Stepper } from '@/components/Playbook';
import { useCandles } from '@/hooks/useCandles';
import { useFetch } from '@/hooks/useFetch';
import { usePrice } from '@/hooks/usePrice';
import { api, type Timeframe } from '@/lib/api';
import { clamp, fmtPrice, readChart, RULE_LIMITS, setupsFrom, type Setup } from '@/lib/chartMath';
import { MAX_CUT_PCT, NETWORKS, type Chain } from '@/lib/constants';
import { proveOwner } from '@/lib/ownership';
import { buildPlan, durationLabel, pct, round2, signedUsd, usd } from '@/lib/pricing';
import type { EntryType } from '@/lib/types';
import { Avatar, AVATAR_TONES, Button, Card, Row, Screen, toneOf } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, DUR, EASE, fonts, radius, space } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

const L = RULE_LIMITS;
const rise = FadeInDown.duration(DUR.enter).easing(Easing.bezier(...EASE));

// Choices for Flash's order options (Placing Orders and TWAP docs). null = Flash's default behaviour.
const TWAP_DURATIONS = [
  { value: 10, label: '10m' },
  { value: 30, label: '30m' },
  { value: 60, label: '1h' },
  { value: 240, label: '4h' },
  { value: 1440, label: '24h' },
];
const ENTRY_EXPIRY: { value: number | null; label: string }[] = [
  { value: null, label: 'Until filled' },
  { value: 4, label: '4h' },
  { value: 24, label: '24h' },
  { value: 168, label: '7d' },
];
const BRACKET_EXPIRY: { value: number | null; label: string }[] = [
  { value: null, label: 'Always' },
  { value: 1, label: '1d' },
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
];
const SLIPPAGE: { value: number | null; label: string }[] = [
  { value: null, label: 'Auto' },
  { value: 0.5, label: '0.5%' },
  { value: 1, label: '1%' },
  { value: 3, label: '3%' },
];

function optionsSummary(o: {
  entryType: EntryType;
  twapMinutes: number;
  entryExpiryHours: number | null;
  bracketExpiryDays: number | null;
  maxSlippagePct: number | null;
}) {
  const first =
    o.entryType === 'twap'
      ? `DCA over ${durationLabel(o.twapMinutes)}`
      : o.entryType === 'limit'
        ? o.entryExpiryHours
          ? `buy waits ${durationLabel(o.entryExpiryHours * 60)}`
          : 'buy waits until filled'
        : o.maxSlippagePct
          ? `${o.maxSlippagePct}% max slippage`
          : 'auto slippage';
  return `${first} · protection ${o.bracketExpiryDays ? `${o.bracketExpiryDays}d` : 'always on'}`;
}

/** Small segmented control used for the entry type. */
function Segment<V extends string>({ value, onChange, options }: { value: V; onChange: (v: V) => void; options: { value: V; label: string }[] }) {
  return (
    <View style={s.segment}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onChange(o.value);
          }}
          style={[s.segmentItem, o.value === value && s.segmentOn]}>
          <T v="small" color={o.value === value ? colors.text : colors.textDim} style={{ fontFamily: fonts.bodyMed }}>
            {o.label}
          </T>
        </Pressable>
      ))}
    </View>
  );
}

/** A labelled row of choice chips. */
function Choice<V extends number | null>({ label, value, onChange, options }: { label: string; value: V; onChange: (v: V) => void; options: { value: V; label: string }[] }) {
  return (
    <View style={{ gap: space(2) }}>
      <T v="small">{label}</T>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {options.map((o) => (
          <Pressable
            key={String(o.value)}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            style={({ pressed }) => [s.choice, o.value === value && s.choiceOn, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
            <T v="small" color={colors.text} style={{ fontFamily: fonts.bodyMed }}>
              {o.label}
            </T>
          </Pressable>
        ))}
      </Row>
    </View>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <T v="label">{label}</T>
      <TextInput placeholderTextColor={colors.textMute} style={[s.input, style]} selectionColor={colors.ink} {...rest} />
    </View>
  );
}

function ProfileForm({ address, sign, onSaved }: { address: string; sign: (m: string) => Promise<string>; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [tone, setTone] = useState<string>(AVATAR_TONES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Animated.View entering={rise}>
      <T v="h1" style={{ marginTop: space(4) }}>
        Become a creator
      </T>
      <T v="body" style={{ marginTop: space(2), marginBottom: space(5) }}>
        Publish your trading rules as playbooks. Each time someone applies one, you earn your cut.
      </T>
      <Card style={{ gap: space(4) }}>
        <Row gap={14}>
          <Avatar name={name || 'You'} tone={tone} size={56} />
          <Row gap={8} style={{ flex: 1, flexWrap: 'wrap' }}>
            {AVATAR_TONES.map((t) => (
              <Pressable key={t} onPress={() => setTone(t)} style={[s.swatchRing, tone === t && { borderColor: colors.ink }]} accessibilityLabel={`Color ${t}`}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: toneOf(t).bg }} />
              </Pressable>
            ))}
          </Row>
        </Row>
        <Field label="Display name" value={name} onChangeText={setName} placeholder="Riya Sharma" maxLength={40} />
        <Field label="One-line bio" value={bio} onChangeText={setBio} placeholder="Scalps ETH with tight stops" maxLength={140} />
        {error ? (
          <T v="small" color={colors.loss}>
            {error}
          </T>
        ) : null}
        <Button
          title="Create profile"
          loading={busy}
          disabled={name.trim().length < 2}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              const proof = await proveOwner(sign, 'Save creator profile', address);
              await api.saveTrader({ address, name, bio, avatar: tone, proof });
              onSaved();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        />
        <T v="mono" style={{ textAlign: 'center' }}>
          One free signature proves this wallet is yours
        </T>
      </Card>
    </Animated.View>
  );
}

export default function Create() {
  const w = useWallet();
  const [chain, setChain] = useState<Chain>('base');
  const net = NETWORKS[chain];
  const price = usePrice(chain);
  const [tf, setTf] = useState<Timeframe>('1h');
  const candles = useCandles(chain, tf);
  const profile = useFetch(() => (w.address ? api.trader(w.address) : Promise.resolve(null)), [w.address]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dip, setDip] = useState(2);
  const [tp, setTp] = useState(5);
  const [sl, setSl] = useState(3);
  const [cut, setCut] = useState(0.5);
  // Flash order options (Placing Orders docs): entry type and the settings that belong to it.
  const [entryType, setEntryType] = useState<EntryType>('limit');
  const [twapMinutes, setTwapMinutes] = useState(60);
  const [twapSlices, setTwapSlices] = useState(6);
  const [entryExpiryHours, setEntryExpiryHours] = useState<number | null>(null);
  const [bracketExpiryDays, setBracketExpiryDays] = useState<number | null>(null);
  const [maxSlippagePct, setMaxSlippagePct] = useState<number | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo(
    () =>
      price ? buildPlan({ entryOffsetPct: -dip, takeProfitPct: tp, stopLossPct: sl, cutPct: cut, entryType }, price.price, 100) : null,
    [price, dip, tp, sl, cut, entryType],
  );
  const reading = useMemo(() => (candles ? readChart(candles) : null), [candles]);
  const setups = useMemo(() => (reading ? setupsFrom(reading) : []), [reading]);

  /** Moves the buy level only: take profit and stop keep their prices (their percentages are recomputed). */
  const setEntry = (nextDip: number) => {
    const d = round2(clamp(nextDip, L.dip.min, L.dip.max));
    setPicked(null);
    if (plan) {
      const e = plan.marketPrice * (1 - d / 100);
      setTp(round2(clamp(((plan.takeProfitPrice - e) / e) * 100, L.tp.min, L.tp.max)));
      setSl(round2(clamp(((e - plan.stopLossPrice) / e) * 100, L.sl.min, L.sl.max)));
    }
    // Moving the buy below the price makes a market buy a limit buy, and back (DCA keeps it as its price cap).
    if (entryType === 'market' && d > 0) setEntryType('limit');
    if (entryType === 'limit' && d === 0) setEntryType('market');
    setDip(d);
  };
  const chooseEntryType = (t: EntryType) => {
    if (t === entryType) return;
    setEntryType(t);
    if (t === 'market') setEntry(0);
    if (t === 'limit' && dip === 0) setEntry(2);
  };
  const setTake = (v: number) => {
    setPicked(null);
    setTp(round2(clamp(v, L.tp.min, L.tp.max)));
  };
  const setStop = (v: number) => {
    setPicked(null);
    setSl(round2(clamp(v, L.sl.min, L.sl.max)));
  };

  const onDrag = (key: LevelKey, p: number) => {
    if (!plan) return;
    if (key === 'entry') setEntry(((plan.marketPrice - p) / plan.marketPrice) * 100);
    if (key === 'tp') setTake(((p - plan.entryPrice) / plan.entryPrice) * 100);
    if (key === 'sl') setStop(((plan.entryPrice - p) / plan.entryPrice) * 100);
  };

  const applySetup = (x: Setup) => {
    Haptics.selectionAsync().catch(() => {});
    setPicked(x.key);
    if (entryType !== 'twap') setEntryType(x.rules.dip > 0 ? 'limit' : 'market');
    setDip(x.rules.dip);
    setTp(x.rules.tp);
    setSl(x.rules.sl);
  };

  const levels: Level[] = plan
    ? [
        { key: 'tp', price: plan.takeProfitPrice, label: `TP ${pct(tp)}`, color: colors.profit, draggable: true },
        {
          key: 'entry',
          price: plan.entryPrice,
          label: entryType === 'twap' ? (dip ? `DCA ≤${pct(-dip)}` : 'DCA') : dip ? `Buy ${pct(-dip)}` : 'Buy now',
          color: colors.ink,
          draggable: true,
        },
        { key: 'sl', price: plan.stopLossPrice, label: `SL ${pct(-sl)}`, color: colors.loss, draggable: true },
      ]
    : [];

  if (!w.address || profile.loading) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator color={colors.textDim} style={{ marginTop: 120 }} />
      </Screen>
    );
  }
  if (!profile.data?.trader) {
    return (
      <Screen>
        <ProfileForm address={w.address} sign={w.signMessage} onSaved={profile.reload} />
      </Screen>
    );
  }

  const stepFor = (v: number) => (v < 1 ? 0.1 : 0.5);
  const trader = profile.data.trader;

  return (
    <Screen>
      <Row style={{ marginTop: space(3), marginBottom: space(4) }} gap={12}>
        <View style={{ flex: 1 }}>
          <T v="h1">New playbook</T>
          <T v="small">as {trader.name}</T>
        </View>
        <Avatar name={trader.name} tone={trader.avatar} size={40} />
      </Row>

      <NetworkSwitch
        value={chain}
        onChange={(c) => {
          setChain(c);
          setPicked(null);
          setInfo(false);
        }}
      />

      <Animated.View entering={rise}>
        <Card glow style={{ marginTop: space(4), padding: space(4) }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: space(3) }}>
            <View>
              <T v="small">{net.asset} / USD</T>
              <T v="numLg">{price ? usd(price.price) : '—'}</T>
            </View>
            <Pressable
              onPress={() => setInfo((v) => !v)}
              style={({ pressed }) => [s.infoBtn, info && { backgroundColor: colors.ink }, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
              accessibilityLabel={info ? 'Hide chart details' : 'Show chart details'}
              hitSlop={8}>
              {info ? <X size={16} strokeWidth={1.75} color={colors.onInk} /> : <Info size={16} strokeWidth={1.75} color={colors.text} />}
            </Pressable>
          </Row>

          {info && reading ? (
            <Animated.View entering={FadeIn.duration(DUR.menu)} exiting={FadeOut.duration(DUR.fast)} style={s.infoRow}>
              {[
                { k: 'Support', v: fmtPrice(reading.support) },
                { k: 'Resistance', v: fmtPrice(reading.resistance) },
                { k: 'Avg move', v: `${reading.atr.toFixed(1)}%` },
                { k: 'Trend', v: pct(reading.trendPct), c: reading.trendPct >= 0 ? colors.profit : colors.loss },
              ].map((x) => (
                <View key={x.k}>
                  <T v="mono" style={{ fontSize: 11 }}>
                    {x.k}
                  </T>
                  <T v="mono" color={x.c ?? colors.text} style={{ fontFamily: fonts.monoMed }}>
                    {x.v}
                  </T>
                </View>
              ))}
            </Animated.View>
          ) : null}

          <TradeChart candles={candles} tf={tf} onTf={setTf} now={price?.price ?? null} levels={levels} onDrag={onDrag} />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: space(3) }}>
            {setups.map((x) => (
              <Pressable
                key={x.key}
                onPress={() => applySetup(x)}
                style={({ pressed }) => [s.setup, picked === x.key && s.setupOn, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
                <T v="small" color={colors.text} style={{ fontFamily: fonts.bodyMed }}>
                  {x.title}
                </T>
                <T v="mono" style={{ fontSize: 11 }}>
                  {x.rules.dip ? pct(-x.rules.dip) : 'now'} · {pct(x.rules.tp)} · {pct(-x.rules.sl)}
                </T>
              </Pressable>
            ))}
          </ScrollView>
          <T v="mono" style={{ marginTop: space(2), fontSize: 11 }}>
            Drag Buy, TP or SL on the chart. Each moves on its own.
          </T>
        </Card>
      </Animated.View>

      <Card style={{ marginTop: space(4), paddingVertical: space(2) }}>
        <View style={{ paddingTop: space(2), paddingBottom: space(3), gap: space(2) }}>
          <Segment
            value={entryType}
            onChange={chooseEntryType}
            options={[
              { value: 'market', label: 'Market' },
              { value: 'limit', label: 'Limit' },
              { value: 'twap', label: 'DCA' },
            ]}
          />
          <T v="mono" style={{ fontSize: 11 }}>
            {entryType === 'market'
              ? 'Buys right away at the best price'
              : entryType === 'limit'
                ? 'Buys only when the price dips to the buy level'
                : `Buys in ${twapSlices} slices over ${durationLabel(twapMinutes)} (Flash TWAP)`}
          </T>
        </View>
        {entryType !== 'market' ? (
          <Stepper
            label={entryType === 'twap' ? 'Price cap' : 'Buy'}
            hint={entryType === 'twap' ? (dip === 0 ? 'None, buys at any price' : 'Slices buy at or below') : 'Below the price'}
            value={dip}
            onChange={setEntry}
            step={0.5}
            min={entryType === 'limit' ? 0.5 : L.dip.min}
            max={L.dip.max}
            format={(v) => (v === 0 ? 'None' : pct(-v))}
            sub={plan ? fmtPrice(plan.entryPrice) : undefined}
          />
        ) : null}
        {entryType === 'twap' ? (
          <Stepper
            label="Slices"
            hint="Equal parts of the buy"
            value={twapSlices}
            onChange={(v) => setTwapSlices(Math.round(v))}
            step={1}
            min={2}
            max={Math.min(48, twapMinutes)}
            format={(v) => `${Math.round(v)}`}
            sub={`every ${durationLabel(twapMinutes / twapSlices)}`}
          />
        ) : null}
        <Stepper
          label="Take profit"
          hint="Above the buy"
          value={tp}
          onChange={setTake}
          step={stepFor(tp)}
          min={L.tp.min}
          max={L.tp.max}
          format={(v) => pct(v)}
          tone={colors.profit}
          sub={plan ? `${fmtPrice(plan.takeProfitPrice)} · ${signedUsd(plan.profitAtTpUsd)}` : undefined}
        />
        <Stepper
          label="Stop"
          hint="Required"
          value={sl}
          onChange={setStop}
          step={stepFor(sl)}
          min={L.sl.min}
          max={L.sl.max}
          format={(v) => pct(-v)}
          tone={colors.loss}
          sub={plan ? `${fmtPrice(plan.stopLossPrice)} · ${signedUsd(plan.lossAtSlUsd)}` : undefined}
        />
        <Stepper
          label="Your cut"
          hint="Per applied trade"
          value={cut}
          onChange={setCut}
          step={0.1}
          min={0}
          max={MAX_CUT_PCT}
          format={(v) => `${v.toFixed(1)}%`}
          sub={plan ? `${usd(plan.creatorFeeUsd)} per $100` : undefined}
        />
        <Pressable onPress={() => setShowOptions((v) => !v)} style={({ pressed }) => [s.optionsRow, pressed && { opacity: 0.6 }]} accessibilityRole="button">
          <View style={{ flex: 1 }}>
            <T v="bodyMed">Order options</T>
            <T v="mono" style={{ fontSize: 11 }} numberOfLines={1}>
              {optionsSummary({ entryType, twapMinutes, entryExpiryHours, bracketExpiryDays, maxSlippagePct })}
            </T>
          </View>
          {showOptions ? <ChevronUp size={18} strokeWidth={1.75} color={colors.textDim} /> : <ChevronDown size={18} strokeWidth={1.75} color={colors.textDim} />}
        </Pressable>
        {showOptions ? (
          <Animated.View entering={FadeIn.duration(DUR.menu)} style={{ gap: space(4), paddingBottom: space(3) }}>
            {entryType === 'twap' ? (
              <Choice label="DCA duration" value={twapMinutes} onChange={(m) => { setTwapMinutes(m); setTwapSlices((n) => Math.min(n, Math.min(48, m))); }} options={TWAP_DURATIONS} />
            ) : null}
            {entryType === 'limit' ? (
              <Choice label="Buy waits for" value={entryExpiryHours} onChange={setEntryExpiryHours} options={ENTRY_EXPIRY} />
            ) : null}
            {entryType === 'market' ? (
              <Choice label="Max slippage" value={maxSlippagePct} onChange={setMaxSlippagePct} options={SLIPPAGE} />
            ) : null}
            <Choice label="Take profit and stop stay active" value={bracketExpiryDays} onChange={setBracketExpiryDays} options={BRACKET_EXPIRY} />
          </Animated.View>
        ) : null}
        <T v="mono" style={{ textAlign: 'center', paddingVertical: space(2), fontSize: 11 }}>
          Profit and loss shown for a $100 trade
        </T>
      </Card>

      <Card style={{ marginTop: space(4), gap: space(4) }}>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Dip Catcher" maxLength={32} />
        <Field label="What it does" value={description} onChangeText={setDescription} placeholder="Buys small dips, exits quickly" maxLength={200} />
      </Card>

      {error ? (
        <T v="small" color={colors.loss} style={{ marginTop: space(3) }}>
          {error}
        </T>
      ) : null}
      <Button
        title="Publish playbook"
        loading={busy}
        disabled={name.trim().length < 3}
        style={{ marginTop: space(5) }}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            const proof = await proveOwner(w.signMessage, 'Publish playbook', w.address!);
            const { template } = await api.createTemplate({
              creator: w.address!,
              name,
              description,
              entryOffsetPct: dip,
              takeProfitPct: tp,
              stopLossPct: sl,
              cutPct: cut,
              chain,
              entryType,
              twapMinutes: entryType === 'twap' ? twapMinutes : null,
              twapSlices: entryType === 'twap' ? twapSlices : null,
              entryExpiryHours: entryType === 'limit' ? entryExpiryHours : null,
              bracketExpiryDays,
              maxSlippagePct: entryType === 'market' ? maxSlippagePct : null,
              proof,
            });
            setName('');
            setDescription('');
            router.push({ pathname: '/template/[id]', params: { id: template.id } });
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      />
      <T v="mono" style={{ textAlign: 'center', marginTop: space(2) }}>
        {name.trim().length < 3 ? 'Name it to publish' : 'One free signature to publish'}
      </T>
    </Screen>
  );
}

const s = StyleSheet.create({
  segment: { flexDirection: 'row', padding: 3, gap: 2, borderRadius: radius.sm, backgroundColor: colors.cardHi },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm - 3 },
  segmentOn: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    minHeight: 60,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderHi,
  },
  choice: {
    paddingHorizontal: space(3),
    height: 34,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderHi,
    backgroundColor: colors.card,
  },
  choiceOn: { backgroundColor: colors.accent, borderColor: colors.ink },
  input: {
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderHi,
    backgroundColor: colors.bg,
    color: colors.text,
    paddingHorizontal: space(4),
    fontFamily: fonts.bodyMed,
    fontSize: 15,
  },
  swatchRing: { padding: 2, borderRadius: 16, borderWidth: 1.5, borderColor: 'transparent' },
  infoBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: space(3),
    marginBottom: space(3),
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
  },
  setup: {
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderHi,
    backgroundColor: colors.card,
  },
  setupOn: { backgroundColor: colors.accent, borderColor: colors.ink },
});
