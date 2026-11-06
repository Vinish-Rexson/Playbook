import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { ApplySheet, freshSteps, type StepView } from '@/components/ApplySheet';
import { TradeChart } from '@/components/charts/TradeChart';
import { ModeBadge } from '@/components/ModeBadge';
import { NetworkSwitch } from '@/components/NetworkSwitch';
import { NetworkTag, orderSummary, RuleChips, StatusPill } from '@/components/Playbook';
import { useCandles } from '@/hooks/useCandles';
import { useFetch } from '@/hooks/useFetch';
import { usePrice } from '@/hooks/usePrice';
import { api, type Timeframe } from '@/lib/api';
import { runApply } from '@/lib/applyFlow';
import { fmtPrice } from '@/lib/chartMath';
import { CHAINS, NETWORKS, playbookChains, type Chain } from '@/lib/constants';
import { buildPlan, shortAddr, signedUsd, timeAgo, usd } from '@/lib/pricing';
import type { Application } from '@/lib/types';
import { Avatar, Button, Card, Header, KV, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, DUR, EASE, fonts, radius, space } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

const AMOUNTS = [1, 5, 10, 25];
const rise = (i: number) => FadeInDown.delay(i * 50).duration(DUR.enter).easing(Easing.bezier(...EASE));

export default function TemplateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const w = useWallet();
  const { data, loading, reload } = useFetch(() => api.template(id), [id], 10_000);
  const t = data?.template;
  // The playbook decides where it can trade; the user picks when it allows both.
  const offered = playbookChains(t?.chain);
  const [picked, setPicked] = useState<Chain | null>(null);
  const chain: Chain = picked && offered.includes(picked) ? picked : t?.chain === 'solana' ? 'solana' : 'base';
  const net = NETWORKS[chain];
  const price = usePrice(chain);
  const [tf, setTf] = useState<Timeframe>('1h');
  const candles = useCandles(chain, tf);
  const [amount, setAmount] = useState('5');
  const [sheet, setSheet] = useState(false);
  const [steps, setSteps] = useState<StepView>(freshSteps());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Application | null>(null);

  const amountUsd = Number(amount) || 0;
  const plan = useMemo(
    () => (t && price ? buildPlan(t, price.price, Math.max(amountUsd, 0)) : null),
    [t, price, amountUsd],
  );

  const apply = async () => {
    if (!t) return;
    setSteps(freshSteps());
    setError(null);
    setResult(null);
    setSheet(true);
    try {
      const position = await runApply({
        templateId: t.id,
        amountUsd,
        chain,
        wallet: w,
        onStep: (key, state, detail) => setSteps((s) => ({ ...s, [key]: { state, detail } })),
      });
      setResult(position);
      reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSteps((s) => {
        const active = (Object.keys(s) as (keyof StepView)[]).find((k) => s[k].state === 'active');
        return active ? { ...s, [active]: { state: 'error' } } : s;
      });
      setError(msg);
    }
  };

  if (loading && !t) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator color={colors.textDim} style={{ marginTop: 120 }} />
      </Screen>
    );
  }
  if (!t) {
    return (
      <Screen>
        <Header title="Playbook" onBack={() => router.back()} />
        <T v="body">This playbook no longer exists.</T>
      </Screen>
    );
  }

  const closed = t.stats.wins + t.stats.losses;
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', marginTop: space(2), marginBottom: space(4) }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.back} accessibilityLabel="Back">
          <ChevronLeft size={22} strokeWidth={1.75} color={colors.text} />
        </Pressable>
        <ModeBadge />
      </Row>

      <Animated.View entering={rise(0)} style={{ gap: space(3) }}>
        <Row gap={12}>
          <Avatar name={t.trader?.name} tone={t.trader?.avatar} size={48} />
          <View style={{ flex: 1 }}>
            <T v="h1">{t.name}</T>
            <Pressable
              onPress={() => router.push({ pathname: '/trader/[address]', params: { address: t.creator } })}
              hitSlop={6}
              accessibilityRole="link">
              <T v="small" color={colors.text} style={{ textDecorationLine: 'underline' }}>
                by {t.trader?.name ?? 'Unknown'}
              </T>
            </Pressable>
          </View>
        </Row>
        {t.description ? <T v="body">{t.description}</T> : null}
        <RuleChips t={t} />
        <T v="mono">{orderSummary(t)}</T>
        <View style={st.stats}>
          {[
            { k: 'Applied', v: String(t.stats.applies) },
            { k: 'Win rate', v: closed ? `${Math.round((100 * t.stats.wins) / closed)}%` : '—' },
            { k: 'Creator cut', v: `${t.cutPct}%` },
          ].map((x, i) => (
            <View key={x.k} style={[st.stat, i > 0 && st.statLine]}>
              <T v="mono">{x.k}</T>
              <T v="num" style={{ marginTop: 2 }}>
                {x.v}
              </T>
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={rise(1)} style={{ marginTop: space(5), gap: space(2) }}>
        {offered.length > 1 ? (
          <NetworkSwitch
            value={chain}
            onChange={setPicked}
            disabled={CHAINS.filter((c) => !offered.includes(c) || (c === 'solana' && !w.solAddress))}
          />
        ) : (
          <Row gap={8}>
            <NetworkTag chain={t.chain} />
            <T v="small">
              Trades {net.asset} on {net.name}
            </T>
          </Row>
        )}
        {!w.solAddress && offered.includes('solana') ? (
          <T v="small">Solana needs a wallet created or imported with a recovery phrase.</T>
        ) : null}
      </Animated.View>

      <Animated.View entering={rise(2)}>
        <Card style={{ marginTop: space(4), padding: space(4) }} glow>
          <Row style={{ justifyContent: 'space-between', marginBottom: space(3) }}>
            <View>
              <T v="small">If you apply now</T>
              <T v="numLg">{price ? usd(price.price) : '—'}</T>
            </View>
            <T v="mono">{plan ? (plan.orderType === 'market' ? 'Market buy' : plan.orderType === 'twap' ? 'DCA buy' : 'Limit buy') : ''}</T>
          </Row>
          <TradeChart
            candles={candles}
            tf={tf}
            onTf={setTf}
            now={price?.price ?? null}
            height={260}
            levels={
              plan
                ? [
                    { key: 'tp', price: plan.takeProfitPrice, label: `TP ${fmtPrice(plan.takeProfitPrice)}`, color: colors.profit },
                    {
                      key: 'entry',
                      price: plan.entryPrice,
                      label: plan.orderType === 'market' ? 'Buy now' : plan.orderType === 'twap' ? (plan.entryPrice < plan.marketPrice ? `DCA ≤${fmtPrice(plan.entryPrice)}` : 'DCA') : `Buy ${fmtPrice(plan.entryPrice)}`,
                      color: colors.ink,
                    },
                    { key: 'sl', price: plan.stopLossPrice, label: `SL ${fmtPrice(plan.stopLossPrice)}`, color: colors.loss },
                  ]
                : []
            }
          />
        </Card>
      </Animated.View>

      <Animated.View entering={rise(3)}>
        <Card style={{ marginTop: space(4) }}>
          <T v="small">Amount, USDC on {net.name}</T>
          <Row style={st.amountRow}>
            <T v="numLg" color={colors.textMute}>
              $
            </T>
            <TextInput
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              style={st.amountInput}
              selectionColor={colors.ink}
              accessibilityLabel="Amount in USDC"
            />
          </Row>
          <Row gap={8}>
            {AMOUNTS.map((a) => (
              <Pressable
                key={a}
                onPress={() => setAmount(String(a))}
                style={({ pressed }) => [st.amountChip, Number(amount) === a && st.amountChipOn, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
                <T v="bodyMed" color={colors.text}>
                  ${a}
                </T>
              </Pressable>
            ))}
          </Row>
          {plan && amountUsd > 0 ? (
            <View style={{ marginTop: space(3) }}>
              <KV k="You get about" v={`${plan.estEth.toFixed(chain === 'solana' ? 4 : 5)} ${net.asset}`} />
              <KV k={`At take profit ${usd(plan.takeProfitPrice)}`} v={signedUsd(plan.profitAtTpUsd)} color={colors.profit} />
              <KV k={`At stop ${usd(plan.stopLossPrice)}`} v={signedUsd(plan.lossAtSlUsd)} color={colors.loss} />
              <KV k={`Creator cut, ${t.cutPct}%`} v={usd(plan.creatorFeeUsd)} />
              <KV k="Definitive fee" v={plan.definitiveFeeUsd ? usd(plan.definitiveFeeUsd) : 'Included'} />
            </View>
          ) : (
            <T v="small" style={{ marginTop: space(3) }}>
              Enter an amount
            </T>
          )}
          <Button title="Apply playbook" onPress={apply} disabled={!plan || amountUsd <= 0} style={{ marginTop: space(4) }} />
          <T v="mono" style={{ textAlign: 'center', marginTop: space(2) }}>
            {chain === 'solana' ? 'One-time setup, then 2 free signatures' : '2 free signatures, approvals the first time'}
          </T>
        </Card>
      </Animated.View>

      {data.recent.length > 0 && (
        <>
          <T v="h2" style={{ marginTop: space(8), marginBottom: space(3) }}>
            Recent applies
          </T>
          <Card style={{ paddingVertical: space(2) }}>
            {data.recent.map((a, i) => (
              <Row key={a.id} style={[{ justifyContent: 'space-between', minHeight: 56 }, i > 0 && st.rowLine]}>
                <View>
                  <T v="mono" color={colors.text}>
                    {shortAddr(a.funder)} · {usd(a.amountUsd, 0)}
                  </T>
                  <T v="small">
                    {timeAgo(a.createdAt)}
                    {a.pnlUsd !== undefined ? ` · ${signedUsd(a.pnlUsd)}` : ''}
                  </T>
                </View>
                <StatusPill status={a.status} />
              </Row>
            ))}
          </Card>
        </>
      )}

      <ApplySheet
        visible={sheet}
        steps={steps}
        error={error}
        result={result}
        templateName={t.name}
        chain={chain}
        onClose={() => setSheet(false)}
        onViewPosition={() => {
          setSheet(false);
          if (result) router.push({ pathname: '/position/[id]', params: { id: result.id } });
          else router.navigate('/positions');
        }}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  back: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  stat: { flex: 1, paddingVertical: space(3) },
  statLine: { borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: space(3) },
  amountRow: { marginTop: space(1), marginBottom: space(3), gap: 6 },
  amountInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 34,
    paddingVertical: 4,
  },
  amountChip: {
    flex: 1,
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderHi,
  },
  amountChipOn: { borderColor: colors.ink, backgroundColor: colors.accent, borderWidth: 1.25 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderHi },
});
