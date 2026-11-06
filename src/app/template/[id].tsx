import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ApplySheet, freshSteps, type StepView } from '@/components/ApplySheet';
import { ModeBadge } from '@/components/ModeBadge';
import { NetworkSwitch } from '@/components/NetworkSwitch';
import { TradeChart } from '@/components/charts/TradeChart';
import { RuleChips, StatusPill } from '@/components/Playbook';
import { useCandles } from '@/hooks/useCandles';
import { useFetch } from '@/hooks/useFetch';
import { usePrice } from '@/hooks/usePrice';
import { api, type Timeframe } from '@/lib/api';
import { fmtPrice } from '@/lib/chartMath';
import { runApply } from '@/lib/applyFlow';
import { CHAINS, NETWORKS, playbookChains, type Chain } from '@/lib/constants';
import { buildPlan, shortAddr, signedUsd, timeAgo, usd } from '@/lib/pricing';
import type { Application } from '@/lib/types';
import { Avatar, Button, Card, Divider, KV, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, fonts, radius, space } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

const AMOUNTS = [1, 5, 10, 25];

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
        <ActivityIndicator color={colors.cyan} style={{ marginTop: 120 }} />
      </Screen>
    );
  }
  if (!t) {
    return (
      <Screen>
        <T v="h2" style={{ marginTop: 60 }}>
          Playbook not found
        </T>
      </Screen>
    );
  }

  const closed = t.stats.wins + t.stats.losses;
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', marginTop: space(2), marginBottom: space(4) }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.back}>
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <ModeBadge />
      </Row>

      <Animated.View entering={FadeInDown.duration(400)} style={{ gap: space(3) }}>
        <Row gap={12}>
          <Avatar emoji={t.trader?.avatar} size={52} />
          <View style={{ flex: 1 }}>
            <T v="h1">{t.name}</T>
            <T v="small">
              by {t.trader?.name ?? 'Unknown'} · @{t.trader?.handle ?? 'anon'}
            </T>
          </View>
        </Row>
        <T v="body">{t.description}</T>
        <RuleChips t={t} />
      </Animated.View>

      <Row gap={10} style={{ marginTop: space(5) }}>
        {[
          { k: 'Applied', v: String(t.stats.applies) },
          { k: 'Win rate', v: closed ? `${Math.round((100 * t.stats.wins) / closed)}%` : '—' },
          { k: 'Creator cut', v: `${t.cutPct}%` },
        ].map((x) => (
          <Card key={x.k} style={{ flex: 1, paddingVertical: space(3) }}>
            <T v="label">{x.k}</T>
            <T v="h2" style={{ marginTop: 4 }}>
              {x.v}
            </T>
          </Card>
        ))}
      </Row>

      <Animated.View entering={FadeInDown.delay(60).duration(400)} style={{ marginTop: space(5), gap: space(2) }}>
        <T v="label">Trade on</T>
        <NetworkSwitch
          value={chain}
          onChange={setPicked}
          disabled={CHAINS.filter((c) => !offered.includes(c) || (c === 'solana' && !w.solAddress))}
        />
        {offered.length === 1 ? (
          <T v="small">The creator set this playbook to {net.name} only.</T>
        ) : null}
        {!w.solAddress && offered.includes('solana') ? (
          <T v="small">Solana needs a wallet created or imported with a recovery phrase.</T>
        ) : null}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(100).duration(400)}>
        <Card style={{ marginTop: space(4) }} glow>
          <Row style={{ justifyContent: 'space-between', marginBottom: space(3) }}>
            <T v="label">If you apply now · {net.asset}</T>
            <T v="small">{plan ? (plan.orderType === 'market' ? 'Market buy' : 'Limit buy') : ''}</T>
          </Row>
          <TradeChart
            candles={candles}
            tf={tf}
            onTf={setTf}
            now={price?.price ?? null}
            height={280}
            levels={
              plan
                ? [
                    { key: 'tp', price: plan.takeProfitPrice, label: `TP ${fmtPrice(plan.takeProfitPrice)}`, color: colors.profit },
                    {
                      key: 'entry',
                      price: plan.entryPrice,
                      label: plan.orderType === 'market' ? 'Buy now' : `Buy ${fmtPrice(plan.entryPrice)}`,
                      color: colors.primary,
                    },
                    { key: 'sl', price: plan.stopLossPrice, label: `SL ${fmtPrice(plan.stopLossPrice)}`, color: colors.loss },
                  ]
                : []
            }
          />
        </Card>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(180).duration(400)}>
        <Card style={{ marginTop: space(4) }}>
          <T v="label">Amount</T>
          <Row style={st.amountRow}>
            <T v="numLg" color={colors.textMute}>
              $
            </T>
            <TextInput
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              style={st.amountInput}
              selectionColor={colors.cyan}
            />
            <T v="small">USDC on {net.name}</T>
          </Row>
          <Row gap={8}>
            {AMOUNTS.map((a) => (
              <Pressable
                key={a}
                onPress={() => setAmount(String(a))}
                style={[st.amountChip, Number(amount) === a && st.amountChipOn]}>
                <T v="bodyMed" color={Number(amount) === a ? colors.text : colors.textDim}>
                  ${a}
                </T>
              </Pressable>
            ))}
          </Row>
          {plan && amountUsd > 0 ? (
            <>
              <Divider />
              <KV k="You get about" v={`${plan.estEth.toFixed(chain === 'solana' ? 4 : 5)} ${net.asset}`} />
              <KV k={`At take profit ${usd(plan.takeProfitPrice)}`} v={signedUsd(plan.profitAtTpUsd)} color={colors.profit} />
              <KV k={`At stop-loss ${usd(plan.stopLossPrice)}`} v={signedUsd(plan.lossAtSlUsd)} color={colors.loss} />
              <KV k={`Creator cut (${t.cutPct}%)`} v={usd(plan.creatorFeeUsd)} color={colors.cyan} />
              <KV k="Definitive fee" v={plan.definitiveFeeUsd ? usd(plan.definitiveFeeUsd) : 'Included'} />
            </>
          ) : (
            <T v="small" style={{ marginTop: space(3) }}>
              Enter an amount.
            </T>
          )}
          <Button
            title="Apply playbook"
            onPress={apply}
            disabled={!plan || amountUsd <= 0}
            style={{ marginTop: space(4) }}
          />
          <T v="small" style={{ textAlign: 'center', marginTop: space(2) }}>
            {chain === 'solana'
              ? 'Two free signatures, plus a one-time setup on Solana. Funds stay in your wallet until Flash executes.'
              : 'Two free signatures. Funds stay in your wallet until Flash executes.'}
          </T>
        </Card>
      </Animated.View>

      {data.recent.length > 0 && (
        <>
          <T v="h2" style={{ marginTop: space(8), marginBottom: space(3) }}>
            Recent applies
          </T>
          <Card style={{ gap: space(1) }}>
            {data.recent.map((a) => (
              <Row key={a.id} style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
                <View>
                  <T v="bodyMed">
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
          router.navigate('/positions');
        }}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  back: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.cardHi,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountRow: { marginVertical: space(2), gap: 6 },
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
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.cardHi,
    borderWidth: 1,
    borderColor: colors.border,
  },
  amountChipOn: { borderColor: colors.cyan, backgroundColor: '#3DD6FF1A' },
});
