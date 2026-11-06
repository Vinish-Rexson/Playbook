import { router } from 'expo-router';
import { ExternalLink } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { ModeBadge } from '@/components/ModeBadge';
import { StatusPill } from '@/components/Playbook';
import { useFetch } from '@/hooks/useFetch';
import { api } from '@/lib/api';
import { txUrl } from '@/lib/constants';
import { cancelMessageFor } from '@/lib/flashMessages';
import { signedUsd, timeAgo, usd } from '@/lib/pricing';
import type { Application, PositionStatus } from '@/lib/types';
import { Button, Card, Divider, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, space } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

const ORDER: PositionStatus[] = ['waiting', 'filled', 'take_profit'];

const REASONS: Record<string, string> = {
  REASON_USER_REQUESTED: 'You cancelled this order.',
  REASON_INSUFFICIENT_FUNDER_BALANCE: 'Flash cancelled it: the wallet no longer held enough of the token.',
  REASON_ORDER_EXPIRED: 'The order expired before it filled.',
  REASON_PRICE_IMPACT_TOO_HIGH: 'Flash could not sell within the allowed price impact.',
  REASON_INSUFFICIENT_LIQUIDITY: 'Not enough liquidity to execute.',
  REASON_ORDER_TRIGGERED_ON_ENTRY: 'A trigger was already hit when the order was placed.',
};
const closeReasonText = (r: string) =>
  REASONS[r] ?? `Flash closed it: ${r.replace(/^REASON_/, '').toLowerCase().replace(/_/g, ' ')}.`;

function Timeline({ status }: { status: PositionStatus }) {
  const idx = status === 'stop_loss' ? 2 : ORDER.indexOf(status);
  const labels = ['Placed', 'Bought', status === 'stop_loss' ? 'Stopped' : 'Profit'];
  const end = status === 'stop_loss' ? colors.loss : colors.profit;
  return (
    <Row gap={0} style={{ marginVertical: space(3) }}>
      {labels.map((l, i) => {
        const on = idx >= i;
        const c = !on ? colors.border : i === 2 ? end : i === 1 ? colors.cyan : colors.primary;
        return (
          <View key={l} style={{ flex: 1, alignItems: i === 0 ? 'flex-start' : i === 2 ? 'flex-end' : 'center' }}>
            <View style={{ height: 4, alignSelf: 'stretch', backgroundColor: c, borderRadius: 2, marginHorizontal: 2 }} />
            <T v="small" color={on ? colors.text : colors.textMute} style={{ marginTop: 6 }}>
              {l}
            </T>
          </View>
        );
      })}
    </Row>
  );
}

function PositionCard({ p, onCancel }: { p: Application; onCancel: (p: Application) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const closed = p.status === 'take_profit' || p.status === 'stop_loss';
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable onPress={() => router.push({ pathname: '/template/[id]', params: { id: p.templateId } })} style={{ flex: 1 }}>
          <T v="h2">{p.templateName}</T>
          <T v="small">
            {usd(p.amountUsd)} · {timeAgo(p.createdAt)}
          </T>
        </Pressable>
        <StatusPill status={p.status} />
      </Row>

      {p.status !== 'cancelled' && p.status !== 'failed' && p.status !== 'unprotected' ? <Timeline status={p.status} /> : <Divider />}

      <Row style={{ justifyContent: 'space-between' }}>
        {[
          { k: p.filledPrice ? 'Bought' : 'Buy at', v: usd(p.filledPrice ?? p.entryPrice), c: colors.text },
          { k: 'Target', v: usd(p.takeProfitPrice), c: colors.profit },
          { k: 'Stop', v: usd(p.stopLossPrice), c: colors.loss },
        ].map((x) => (
          <View key={x.k}>
            <T v="label">{x.k}</T>
            <T v="num" color={x.c} style={{ marginTop: 3 }}>
              {x.v}
            </T>
          </View>
        ))}
      </Row>

      {closed && p.pnlUsd !== undefined ? (
        <Row style={{ justifyContent: 'space-between', marginTop: space(4) }}>
          <T v="bodyMed">Result</T>
          <T v="h2" color={p.pnlUsd >= 0 ? colors.profit : colors.loss}>
            {signedUsd(p.pnlUsd)}
          </T>
        </Row>
      ) : null}

      {p.closeReason && (p.status === 'cancelled' || p.status === 'failed' || p.status === 'unprotected') ? (
        <T v="small" style={{ marginTop: space(3) }}>
          {closeReasonText(p.closeReason)}
        </T>
      ) : null}

      {p.txs.length > 0 ? (
        <Row gap={8} style={{ flexWrap: 'wrap', marginTop: space(3) }}>
          {p.txs.map((tx) => (
            <Pressable key={tx.hash + tx.label} onPress={() => Linking.openURL(txUrl(tx.hash))}>
              <Row gap={4}>
                <T v="small" color={colors.cyan}>
                  {tx.label}
                </T>
                <ExternalLink size={12} color={colors.cyan} />
              </Row>
            </Pressable>
          ))}
        </Row>
      ) : null}

      {p.status === 'waiting' ? (
        <Button
          title="Cancel order"
          variant="danger"
          size="md"
          loading={busy}
          style={{ marginTop: space(4) }}
          onPress={async () => {
            setBusy(true);
            try {
              await onCancel(p);
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </Card>
  );
}

export default function Positions() {
  const w = useWallet();
  const { data, loading, refreshing, reload, error } = useFetch(
    () => (w.address ? api.positions(w.address) : Promise.resolve({ positions: [] })),
    [w.address],
    5000,
  );
  const positions = data?.positions ?? [];
  const open = positions.filter((p) => p.status === 'waiting' || p.status === 'filled').length;
  const realized = positions.reduce((s, p) => s + (p.status === 'take_profit' || p.status === 'stop_loss' ? p.pnlUsd ?? 0 : 0), 0);

  const cancel = async (p: Application) => {
    const sig = await w.signMessage(cancelMessageFor(p.orderId));
    await api.cancel(p.id, sig);
    reload();
  };

  return (
    <Screen onRefresh={reload} refreshing={refreshing}>
      <Row style={{ justifyContent: 'space-between', marginTop: space(3), marginBottom: space(5) }}>
        <T v="h1">Positions</T>
        <ModeBadge />
      </Row>

      <Row gap={10}>
        <Card style={{ flex: 1 }}>
          <T v="label">Open</T>
          <T v="numLg" style={{ marginTop: 4 }}>
            {open}
          </T>
        </Card>
        <Card style={{ flex: 1 }}>
          <T v="label">Realized</T>
          <T v="numLg" color={realized >= 0 ? colors.profit : colors.loss} style={{ marginTop: 4 }}>
            {signedUsd(realized)}
          </T>
        </Card>
      </Row>

      {loading && !data ? <ActivityIndicator color={colors.cyan} style={{ marginTop: space(10) }} /> : null}
      {error && !data ? (
        <T v="small" color={colors.loss} style={{ marginTop: space(4) }}>
          {error}
        </T>
      ) : null}

      {data && positions.length === 0 ? (
        <Card style={{ marginTop: space(5), alignItems: 'center', gap: space(3), paddingVertical: space(8) }}>
          <T v="h2">No positions yet</T>
          <T v="body" style={{ textAlign: 'center' }}>
            Pick a playbook and apply it. Its progress shows up here.
          </T>
          <Button title="Browse playbooks" size="md" onPress={() => router.navigate('/discover')} />
        </Card>
      ) : null}

      <View style={{ gap: space(3), marginTop: space(5) }}>
        {positions.map((p, i) => (
          <Animated.View key={p.id} entering={FadeInDown.delay(40 * i)} layout={LinearTransition}>
            <PositionCard p={p} onCancel={cancel} />
          </Animated.View>
        ))}
      </View>
    </Screen>
  );
}
