import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { TradeChart, type Level, type LevelKey } from '@/components/charts/TradeChart';
import { NetworkSwitch } from '@/components/NetworkSwitch';
import { Stepper } from '@/components/Playbook';
import { useCandles } from '@/hooks/useCandles';
import { useFetch } from '@/hooks/useFetch';
import { usePrice } from '@/hooks/usePrice';
import { api, type Timeframe } from '@/lib/api';
import { clamp, fmtPrice, readChart, round1, RULE_LIMITS, setupsFrom, type Setup } from '@/lib/chartMath';
import { MAX_CUT_PCT, NETWORKS, type Chain } from '@/lib/constants';
import { buildPlan, pct, signedUsd, usd } from '@/lib/pricing';
import { Avatar, Button, Card, KV, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, fonts, radius, space } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

const EMOJIS = ['🦊', '🐋', '🦉', '🐯', '🚀', '🦄', '🐉', '🧠'];

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <T v="label">{label}</T>
      <TextInput placeholderTextColor={colors.textMute} style={[s.input, style]} selectionColor={colors.cyan} {...rest} />
    </View>
  );
}

function ProfileForm({ address, onSaved }: { address: string; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState(EMOJIS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Animated.View entering={FadeInDown.duration(400)}>
      <T v="h1" style={{ marginTop: space(4) }}>
        Become a creator
      </T>
      <T v="body" style={{ marginTop: space(2), marginBottom: space(5) }}>
        Publish your trading rules as playbooks. Every time someone applies one, you earn your cut.
      </T>
      <Card style={{ gap: space(4) }}>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {EMOJIS.map((e) => (
            <Pressable key={e} onPress={() => setAvatar(e)} style={{ opacity: avatar === e ? 1 : 0.45 }}>
              <Avatar emoji={e} size={44} />
            </Pressable>
          ))}
        </Row>
        <Field label="Display name" value={name} onChangeText={setName} placeholder="Riya Sharma" maxLength={40} />
        <Field label="One-line bio" value={bio} onChangeText={setBio} placeholder="Scalps ETH, tight stops" maxLength={140} />
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
              await api.saveTrader({ address, name, bio, avatar });
              onSaved();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        />
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
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo(
    () => (price ? buildPlan({ entryOffsetPct: -dip, takeProfitPct: tp, stopLossPct: sl, cutPct: cut }, price.price, 100) : null),
    [price, dip, tp, sl, cut],
  );
  const reading = useMemo(() => (candles ? readChart(candles) : null), [candles]);
  const setups = useMemo(() => (reading ? setupsFrom(reading) : []), [reading]);

  const levels: Level[] = plan
    ? [
        { key: 'tp', price: plan.takeProfitPrice, label: `TP ${pct(tp)} ${fmtPrice(plan.takeProfitPrice)}`, color: colors.profit, draggable: true },
        {
          key: 'entry',
          price: plan.entryPrice,
          label: dip ? `Buy ${pct(-dip)} ${fmtPrice(plan.entryPrice)}` : 'Buy now',
          color: colors.primary,
          draggable: true,
        },
        { key: 'sl', price: plan.stopLossPrice, label: `SL ${pct(-sl)} ${fmtPrice(plan.stopLossPrice)}`, color: colors.loss, draggable: true },
      ]
    : [];

  /** Dragging a level on the chart rewrites the matching rule as a percentage. */
  const onDrag = (key: LevelKey, p: number) => {
    if (!plan) return;
    setPicked(null);
    const L = RULE_LIMITS;
    if (key === 'entry') setDip(round1(clamp(((plan.marketPrice - p) / plan.marketPrice) * 100, L.dip.min, L.dip.max)));
    if (key === 'tp') setTp(round1(clamp(((p - plan.entryPrice) / plan.entryPrice) * 100, L.tp.min, L.tp.max)));
    if (key === 'sl') setSl(round1(clamp(((plan.entryPrice - p) / plan.entryPrice) * 100, L.sl.min, L.sl.max)));
  };

  const applySetup = (x: Setup) => {
    Haptics.selectionAsync().catch(() => {});
    setPicked(x.key);
    setDip(x.rules.dip);
    setTp(x.rules.tp);
    setSl(x.rules.sl);
  };

  if (!w.address || profile.loading) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator color={colors.cyan} style={{ marginTop: 120 }} />
      </Screen>
    );
  }
  if (!profile.data?.trader) {
    return (
      <Screen>
        <ProfileForm address={w.address} onSaved={profile.reload} />
      </Screen>
    );
  }

  const stepFor = (v: number) => (v < 1 ? 0.1 : 0.5);

  return (
    <Screen>
      <Row style={{ marginTop: space(3), gap: 12 }}>
        <Avatar emoji={profile.data.trader.avatar} size={40} />
        <View>
          <T v="label">New playbook</T>
          <T v="h3">by {profile.data.trader.name}</T>
        </View>
      </Row>

      <Card style={{ marginTop: space(5), gap: space(4) }}>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Dip Catcher" maxLength={32} />
        <Field
          label="What it does"
          value={description}
          onChangeText={setDescription}
          placeholder="Buys small dips, exits quickly."
          maxLength={200}
          multiline
          style={{ height: 76, paddingTop: 14, textAlignVertical: 'top' }}
        />
      </Card>

      <Card style={{ marginTop: space(4), gap: space(3) }}>
        <T v="label">Trades on</T>
        <NetworkSwitch
          value={chain}
          onChange={(c) => {
            setChain(c);
            setPicked(null);
          }}
        />
        <T v="small">{chain === 'solana' ? 'Buys SOL with USDC on Solana.' : 'Buys ETH with USDC on Base.'}</T>
      </Card>

      <Card style={{ marginTop: space(4) }} glow>
        <Row style={{ justifyContent: 'space-between', marginBottom: space(3) }}>
          <T v="label">{net.asset} / USD chart</T>
          <T v="num" style={{ fontSize: 15 }}>
            {price ? fmtPrice(price.price) : '—'}
          </T>
        </Row>
        <TradeChart candles={candles} tf={tf} onTf={setTf} now={price?.price ?? null} levels={levels} onDrag={onDrag} />
      </Card>

      {reading ? (
        <Card style={{ marginTop: space(4), gap: space(3) }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="label">What the chart says</T>
            <T v="small">last {reading.lookback} candles</T>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            {[
              { k: 'Support', v: fmtPrice(reading.support), c: colors.profit },
              { k: 'Resistance', v: fmtPrice(reading.resistance), c: colors.loss },
              { k: 'Typical move', v: `${reading.atr.toFixed(1)}%`, c: colors.text },
              { k: 'Trend', v: pct(reading.trendPct), c: reading.trendPct >= 0 ? colors.profit : colors.loss },
            ].map((x) => (
              <View key={x.k}>
                <T v="small">{x.k}</T>
                <T v="num" color={x.c} style={{ fontSize: 14, marginTop: 2 }}>
                  {x.v}
                </T>
              </View>
            ))}
          </Row>
          <T v="small" color={colors.textDim}>
            Start from the chart (one tap), then fine-tune by dragging the lines or with + and −:
          </T>
          {setups.map((x) => (
            <Pressable key={x.key} onPress={() => applySetup(x)} style={[s.setup, picked === x.key && s.setupOn]}>
              <T v="bodyMed">{x.title}</T>
              <T v="small" color={colors.cyan} style={{ marginTop: 2 }}>
                {x.rules.dip ? `Buy ${pct(-x.rules.dip)}` : 'Buy now'} · TP {pct(x.rules.tp)} · SL {pct(-x.rules.sl)}
              </T>
              <T v="small" style={{ marginTop: 2 }}>
                {x.why}
              </T>
            </Pressable>
          ))}
        </Card>
      ) : null}

      <Card style={{ marginTop: space(4) }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="label">Rules</T>
          <T v="small">
            {net.asset} now {price ? fmtPrice(price.price) : '—'}
          </T>
        </Row>
        <Stepper
          label="Entry"
          hint={dip === 0 ? 'Buy at market right away' : 'Limit buy below the current price'}
          value={dip}
          onChange={(v) => {
            setPicked(null);
            setDip(v);
          }}
          step={0.5}
          min={RULE_LIMITS.dip.min}
          max={RULE_LIMITS.dip.max}
          format={(v) => (v === 0 ? 'Now' : pct(-v))}
          tone={colors.primary}
          sub={plan ? fmtPrice(plan.entryPrice) : undefined}
        />
        <Stepper
          label="Take profit"
          hint="Above the entry"
          value={tp}
          onChange={(v) => {
            setPicked(null);
            setTp(v);
          }}
          step={stepFor(tp)}
          min={RULE_LIMITS.tp.min}
          max={RULE_LIMITS.tp.max}
          format={(v) => pct(v)}
          tone={colors.profit}
          sub={plan ? `${fmtPrice(plan.takeProfitPrice)} · ${signedUsd(plan.profitAtTpUsd)}` : undefined}
        />
        <Stepper
          label="Stop-loss"
          hint="Required, protects followers"
          value={sl}
          onChange={(v) => {
            setPicked(null);
            setSl(v);
          }}
          step={stepFor(sl)}
          min={RULE_LIMITS.sl.min}
          max={RULE_LIMITS.sl.max}
          format={(v) => pct(-v)}
          tone={colors.loss}
          sub={plan ? `${fmtPrice(plan.stopLossPrice)} · ${signedUsd(plan.lossAtSlUsd)}` : undefined}
        />
        <Stepper label="Your cut" hint="Of each applied trade" value={cut} onChange={setCut} step={0.1} min={0} max={MAX_CUT_PCT} format={(v) => `${v.toFixed(1)}%`} tone={colors.cyan} sub={plan ? `${usd(plan.creatorFeeUsd)} per $100` : undefined} />
      </Card>

      {plan ? (
        <Card style={{ marginTop: space(4) }}>
          <T v="small" style={{ marginBottom: 4 }}>
            When someone applies $100:
          </T>
          <KV k="They make at take profit" v={signedUsd(plan.profitAtTpUsd)} color={colors.profit} />
          <KV k="They lose at stop-loss" v={signedUsd(plan.lossAtSlUsd)} color={colors.loss} />
          <KV k="You earn" v={usd(plan.creatorFeeUsd)} color={colors.cyan} />
        </Card>
      ) : null}

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
            const { template } = await api.createTemplate({
              creator: w.address!,
              name,
              description,
              entryOffsetPct: dip,
              takeProfitPct: tp,
              stopLossPct: sl,
              cutPct: cut,
              chain,
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
    </Screen>
  );
}

const s = StyleSheet.create({
  setup: {
    padding: space(3),
    borderRadius: radius.md,
    backgroundColor: colors.cardHi,
    borderWidth: 1,
    borderColor: colors.border,
  },
  setupOn: { borderColor: colors.cyan, backgroundColor: '#3DD6FF14' },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderHi,
    backgroundColor: colors.bgElevated,
    color: colors.text,
    paddingHorizontal: space(4),
    fontFamily: fonts.bodyMed,
    fontSize: 16,
  },
});
