// A creator's public page: who they are, how their playbooks do, and the playbooks themselves.
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Copy } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { TemplateCard } from '@/components/Playbook';
import { useFetch } from '@/hooks/useFetch';
import { api } from '@/lib/api';
import { shortAddr, signedUsd } from '@/lib/pricing';
import { Avatar, Card, Header, Row, Screen, Ticket } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, DUR, EASE, space } from '@/ui/theme';

const rise = (i: number) => FadeInDown.delay(Math.min(i, 5) * 50).duration(DUR.enter).easing(Easing.bezier(...EASE));

export default function TraderPage() {
  const { address } = useLocalSearchParams<{ address: string }>();
  const { data, loading } = useFetch(() => api.trader(address), [address], 15_000);
  const [copied, setCopied] = useState(false);

  if (loading && !data) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator color={colors.textDim} style={{ marginTop: 120 }} />
      </Screen>
    );
  }
  const trader = data?.trader;
  if (!trader) {
    return (
      <Screen>
        <Header title="Creator" onBack={() => router.back()} />
        <T v="body">No creator profile at this address.</T>
      </Screen>
    );
  }

  const templates = data.templates;
  const wins = templates.reduce((s, t) => s + t.stats.wins, 0);
  const losses = templates.reduce((s, t) => s + t.stats.losses, 0);
  const pnl = templates.reduce((s, t) => s + t.stats.pnlUsd, 0);
  const copy = async () => {
    await Clipboard.setStringAsync(trader.address);
    Haptics.selectionAsync().catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Screen>
      <Header title="Creator" onBack={() => router.back()} />

      <Animated.View entering={rise(0)}>
        <Row gap={14}>
          <Avatar name={trader.name} tone={trader.avatar} size={64} />
          <View style={{ flex: 1 }}>
            <T v="h1">{trader.name}</T>
            <Pressable onPress={copy} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel="Copy address">
              <T v="mono">
                @{trader.handle} · {shortAddr(trader.address)}
              </T>
              {copied ? <Check size={12} color={colors.profit} /> : <Copy size={12} strokeWidth={1.75} color={colors.textMute} />}
            </Pressable>
          </View>
        </Row>
        {trader.bio ? (
          <T v="body" style={{ marginTop: space(3) }}>
            {trader.bio}
          </T>
        ) : null}
      </Animated.View>

      <Animated.View entering={rise(1)}>
        <Row gap={12} style={{ marginTop: space(5) }}>
          <Ticket label="Applies" style={{ flex: 1 }}>
            <T v="numLg">{data.earnings.applies}</T>
            <T v="mono">
              {templates.length} {templates.length === 1 ? 'playbook' : 'playbooks'}
            </T>
          </Ticket>
          <Ticket label="Win rate" style={{ flex: 1 }}>
            <T v="numLg">{wins + losses ? `${Math.round((100 * wins) / (wins + losses))}%` : '—'}</T>
            <T v="mono">{wins + losses} closed</T>
          </Ticket>
        </Row>
        <Card style={{ marginTop: space(3), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space(4) }}>
          <T v="small">Realized by followers</T>
          <T v="num" color={pnl > 0 ? colors.profit : pnl < 0 ? colors.loss : colors.text}>
            {signedUsd(pnl)}
          </T>
        </Card>
      </Animated.View>

      <T v="h2" style={{ marginTop: space(7), marginBottom: space(3) }}>
        Playbooks
      </T>
      <View style={{ gap: space(3) }}>
        {templates.map((t, i) => (
          <Animated.View key={t.id} entering={rise(i + 2)}>
            <TemplateCard t={t} onPress={() => router.push({ pathname: '/template/[id]', params: { id: t.id } })} />
          </Animated.View>
        ))}
        {templates.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: space(6) }}>
            <T v="small">No playbooks published yet</T>
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}
