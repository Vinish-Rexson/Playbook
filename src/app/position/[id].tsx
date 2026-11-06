// One position in full: live or realized P&L, the chart with its levels, every detail and order, the
// transactions, and the actions (cancel a waiting buy, or close the position early).
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, ExternalLink } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { TradeChart } from '@/components/charts/TradeChart';
import { NetworkTag, StatusPill } from '@/components/Playbook';
import { StepsSheet, type StepRowState } from '@/components/StepsSheet';
import { useCandles } from '@/hooks/useCandles';
import { useFetch } from '@/hooks/useFetch';
import { usePrice } from '@/hooks/usePrice';
import { api, type Timeframe } from '@/lib/api';
import { fmtPrice } from '@/lib/chartMath';
import { CLOSE_STEPS, runClose, type CloseStepKey } from '@/lib/closeFlow';
import { NETWORKS, txUrl } from '@/lib/constants';
import { cancelMessageFor } from '@/lib/flashMessages';
import { pct, shortAddr, signedUsd, usd } from '@/lib/pricing';

import { Button, Card, Header, KV, Row, Screen, Ticket } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, DUR, EASE, space } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

const REASONS: Record<string, string> = {
  REASON_USER_REQUESTED: 'You cancelled this order.',
  REASON_USER_CLOSED: 'You closed this position and sold at market.',
  REASON_CLOSE_FAILED: 'The sell did not go through. You still hold the asset, without take-profit or stop.',
  REASON_INSUFFICIENT_FUNDER_BALANCE: 'Flash cancelled it: the wallet no longer held enough of the token.',
  REASON_ORDER_EXPIRED: 'The order expired before it filled.',
  REASON_PRICE_IMPACT_TOO_HIGH: 'Flash could not sell within the allowed price impact.',
  REASON_INSUFFICIENT_LIQUIDITY: 'Not enough liquidity to execute.',
  REASON_ORDER_TRIGGERED_ON_ENTRY: 'A trigger was already hit when the order was placed.',
};
const reasonText = (r: string) => REASONS[r] ?? `Flash: ${r.replace(/^REASON_/, '').toLowerCase().replace(/_/g, ' ')}.`;
const rise = (i: number) => FadeInDown.delay(i * 50).duration(DUR.enter).easing(Easing.bezier(...EASE));
const freshClose = () => Object.fromEntries(CLOSE_STEPS.map((s) => [s.key, { state: 'pending' as StepRowState }])) as Record<CloseStepKey, { state: StepRowState; detail?: string }>;

export default function PositionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const w = useWallet();
  const { data, loading, error, reload } = useFetch(() => api.position(id), [id], 5000);
  const p = data?.position;
  const price = usePrice(p?.chain ?? 'base');
  const [tf, setTf] = useState<Timeframe>('1h');
  const candles = useCandles(p?.chain ?? 'base', tf);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [steps, setSteps] = useState(freshClose);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeDone, setCloseDone] = useState<{ title: string; body: string } | null>(null);

  if (loading && !p) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator color={colors.textDim} style={{ marginTop: 120 }} />
      </Screen>
    );
  }
  if (!p) {
    return (
      <Screen>
        <Header title="Position" onBack={() => router.back()} />
        <T v="body">{error ?? 'Position not found'}</T>
      </Screen>
    );
  }

  const net = NETWORKS[p.chain];
  const mine = p.chain === 'solana' ? p.funder === w.solAddress : p.funder.toLowerCase() === w.address?.toLowerCase();
  const holding = p.status === 'filled' || p.status === 'closing' || p.status === 'unprotected';
  const realized = ['take_profit', 'stop_loss', 'closed'].includes(p.status) && p.pnlUsd !== undefined;
  const spent = p.spentUsd ?? p.amountUsd;
  const live = holding && p.boughtAmount && price ? p.boughtAmount * price.price - spent : null;
  const pnl = realized ? p.pnlUsd! : live;
  const pnlPct = pnl !== null && spent ? (pnl / spent) * 100 : null;

  const cancelBuy = async () => {
    setBusy(true);
    try {
      const msg = cancelMessageFor(p.orderId);
      const sig = p.chain === 'solana' ? await w.signSolanaMessage(msg) : await w.signMessage(msg);
      await api.cancel(p.id, sig);
      reload();
    } catch (e) {
      Alert.alert('Order not cancelled', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const startClose = () => {
    const amount = p.boughtAmount ? `${+p.boughtAmount.toFixed(6)} ${net.asset}` : `your ${net.asset}`;
    Alert.alert(
      'Close position?',
      `Cancels the take-profit and stop, then sells ${amount} at market${price ? ` (about ${usd((p.boughtAmount ?? 0) * price.price)})` : ''}. You sign twice.`,
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Close position', style: 'destructive', onPress: () => void closeNow() },
      ],
    );
  };

  const closeNow = async () => {
    setSteps(freshClose());
    setCloseError(null);
    setCloseDone(null);
    setSheet(true);
    try {
      const r = await runClose(p, w, (key, state, detail) => setSteps((s) => ({ ...s, [key]: { state, detail } })));
      setCloseDone(
        r.soldByProtection
          ? { title: 'Already closed', body: 'The take-profit or stop sold this position before your close. Nothing else to do.' }
          : r.position.status === 'cancelled'
            ? { title: 'Buy cancelled', body: 'The buy never filled, so cancelling it closed the position.' }
            : { title: 'Selling now', body: `Your ${net.asset} is being sold at market for USDC. The result shows here in a few seconds.` },
      );
      reload();
    } catch (e) {
      setSteps((s) => {
        const active = (Object.keys(s) as CloseStepKey[]).find((k) => s[k].state === 'active');
        return active ? { ...s, [active]: { state: 'error' } } : s;
      });
      setCloseError(e instanceof Error ? e.message : String(e));
      reload();
    }
  };

  const levels = [
    { key: 'tp' as const, price: p.takeProfitPrice, label: `TP ${fmtPrice(p.takeProfitPrice)}`, color: colors.profit },
    { key: 'entry' as const, price: p.filledPrice ?? p.entryPrice, label: `${p.filledPrice ? 'Bought' : 'Buy'} ${fmtPrice(p.filledPrice ?? p.entryPrice)}`, color: colors.ink },
    { key: 'sl' as const, price: p.stopLossPrice, label: `SL ${fmtPrice(p.stopLossPrice)}`, color: colors.loss },
  ];

  return (
    <Screen onRefresh={reload}>
      <Header title="Position" onBack={() => router.back()} />

      <Animated.View entering={rise(0)}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T v="h1" numberOfLines={1}>
              {p.templateName}
            </T>
            <Row gap={8} style={{ marginTop: 2 }}>
              <NetworkTag chain={p.chain} />
              <T v="mono">
                {p.orderType === 'twap' ? 'DCA' : p.orderType === 'limit' ? 'Limit' : 'Market'} · {new Date(p.createdAt).toLocaleString()}
              </T>
            </Row>
          </View>
          <StatusPill status={p.status} />
        </Row>
      </Animated.View>

      <Animated.View entering={rise(1)}>
        <Ticket label={realized ? 'Realized P&L' : holding ? 'Unrealized P&L' : 'P&L'} style={{ marginTop: space(4) }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <T v="numLg" color={pnl === null ? colors.text : pnl >= 0 ? colors.profit : colors.loss}>
              {pnl === null ? '—' : signedUsd(pnl)}
            </T>
            {pnlPct !== null ? (
              <T v="num" color={pnlPct >= 0 ? colors.profit : colors.loss}>
                {pct(pnlPct, 2)}
              </T>
            ) : null}
          </Row>
          <T v="mono">
            {realized
              ? `sold at ${fmtPrice(p.exitPrice ?? 0)}`
              : holding && price
                ? `${net.asset} now ${fmtPrice(price.price)}`
                : p.status === 'waiting'
                  ? 'waiting for the buy to fill'
                  : 'no trade'}
          </T>
        </Ticket>
      </Animated.View>

      <Animated.View entering={rise(2)}>
        <Card style={{ marginTop: space(4), padding: space(4) }}>
          <TradeChart candles={candles} tf={tf} onTf={setTf} now={price?.price ?? null} levels={levels} height={240} />
        </Card>
      </Animated.View>

      <Card style={{ marginTop: space(4), paddingVertical: space(3) }}>
        <KV k="Amount" v={usd(p.amountUsd)} />
        {p.spentUsd ? <KV k="Spent" v={usd(p.spentUsd)} /> : null}
        {p.boughtAmount ? <KV k="Bought" v={`${+p.boughtAmount.toFixed(6)} ${net.asset}`} /> : null}
        <KV k={p.filledPrice ? 'Average buy' : 'Buy at'} v={fmtPrice(p.filledPrice ?? p.entryPrice)} />
        <KV k="Take profit" v={fmtPrice(p.takeProfitPrice)} color={colors.profit} />
        <KV k="Stop" v={fmtPrice(p.stopLossPrice)} color={colors.loss} />
        {p.exitPrice ? <KV k="Sold at" v={fmtPrice(p.exitPrice)} /> : null}
        <KV k="Creator cut" v={`${usd(p.creatorFeeUsd)} (${(p.cutBps / 100).toFixed(2)}%)`} />
        <KV k="Price when applied" v={fmtPrice(p.marketPriceAtApply)} />
      </Card>

      {p.closeReason && !['filled', 'waiting', 'take_profit', 'stop_loss'].includes(p.status) ? (
        <T v="small" style={{ marginTop: space(3) }}>
          {reasonText(p.closeReason)}
        </T>
      ) : null}

      <T v="h2" style={{ marginTop: space(7), marginBottom: space(2) }}>
        Orders and transactions
      </T>
      <Card style={{ paddingVertical: space(2) }}>
        <KV k="Buy order" v={shortAddr(p.orderId)} />
        {p.bracketOrderId ? <KV k="Take-profit / stop order" v={shortAddr(p.bracketOrderId)} /> : null}
        {p.closeOrderId ? <KV k="Close order" v={shortAddr(p.closeOrderId)} /> : null}
        {p.txs.map((tx) => (
          <Pressable key={tx.hash + tx.label} onPress={() => Linking.openURL(txUrl(tx.hash, p.chain))} style={({ pressed }) => [st.tx, pressed && { opacity: 0.6 }]}>
            <T v="small" color={colors.text} style={{ flex: 1 }}>
              {tx.label}
            </T>
            <T v="mono">{shortAddr(tx.hash)}</T>
            <ExternalLink size={13} strokeWidth={1.75} color={colors.textDim} />
          </Pressable>
        ))}
        {p.txs.length === 0 ? <T v="small">No transactions yet</T> : null}
      </Card>

      <Pressable
        onPress={() => router.push({ pathname: '/template/[id]', params: { id: p.templateId } })}
        style={({ pressed }) => [st.link, pressed && { opacity: 0.6 }]}>
        <T v="bodyMed" style={{ flex: 1 }}>
          View the playbook
        </T>
        <ChevronRight size={18} strokeWidth={1.75} color={colors.textMute} />
      </Pressable>

      {mine && p.status === 'waiting' ? (
        <Button title="Cancel order" variant="danger" loading={busy} onPress={cancelBuy} style={{ marginTop: space(5) }} />
      ) : null}
      {mine && (p.status === 'filled' || p.status === 'unprotected') ? (
        <>
          <Button title="Close position" variant="danger" onPress={startClose} style={{ marginTop: space(5) }} />
          <T v="mono" style={{ textAlign: 'center', marginTop: space(2) }}>
            Sells at market now and cancels the take-profit and stop
          </T>
        </>
      ) : null}
      {p.status === 'closing' ? (
        <Row gap={8} style={{ marginTop: space(5), justifyContent: 'center' }}>
          <ActivityIndicator color={colors.textDim} />
          <T v="small">Selling at market…</T>
        </Row>
      ) : null}

      <StepsSheet
        visible={sheet}
        kicker={`Closing · ${net.asset} on ${net.name}`}
        title={p.templateName}
        steps={CLOSE_STEPS}
        view={steps}
        error={closeError}
        done={closeDone}
        onClose={() => setSheet(false)}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  tx: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space(4),
    minHeight: 52,
    paddingHorizontal: space(4),
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
});

