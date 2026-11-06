import { router } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { MarketCard } from '@/components/charts/MarketCard';
import { ModeBadge } from '@/components/ModeBadge';
import { TemplateCard } from '@/components/Playbook';
import { useFetch } from '@/hooks/useFetch';
import { api } from '@/lib/api';
import { usd } from '@/lib/pricing';
import { Row, Screen, Ticket } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, DUR, EASE, fonts, radius, space } from '@/ui/theme';

const enter = (i: number) => FadeInDown.delay(Math.min(i, 5) * 50).duration(DUR.enter).easing(Easing.bezier(...EASE));

export default function Discover() {
  const { data, loading, error, refreshing, reload } = useFetch(() => api.templates(), [], 15_000);
  const [sort, setSort] = useState<'top' | 'new'>('top');

  const list = data?.templates ?? [];
  const sorted = sort === 'top' ? list : [...list].sort((a, b) => b.createdAt - a.createdAt);
  const applies = list.reduce((s, t) => s + t.stats.applies, 0);
  const volume = list.reduce((s, t) => s + t.stats.volumeUsd, 0);

  return (
    <Screen onRefresh={reload} refreshing={refreshing}>
      <Row style={{ justifyContent: 'space-between', marginTop: space(3), marginBottom: space(5) }}>
        <T v="h1">Discover</T>
        <Row gap={10}>
          <ModeBadge />
          <Pressable
            onPress={() => router.push('/search')}
            style={({ pressed }) => [st.iconBtn, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
            accessibilityLabel="Search creators">
            <Search size={18} strokeWidth={1.75} color={colors.text} />
          </Pressable>
        </Row>
      </Row>

      <MarketCard />

      <Row gap={12} style={{ marginTop: space(4) }}>
        <Ticket label="Playbooks" style={{ flex: 1 }}>
          <T v="numLg">{data ? list.length : '—'}</T>
          <T v="mono">{data ? `${applies} applies so far` : ' '}</T>
        </Ticket>
        <Ticket label="Volume applied" style={{ flex: 1.2 }}>
          <T v="numLg">{data ? usd(volume, 0) : '—'}</T>
          <T v="mono">USDC, all networks</T>
        </Ticket>
      </Row>

      <Row gap={10} style={{ marginTop: space(8), marginBottom: space(4) }}>
        {(['top', 'new'] as const).map((k) => (
          <Pressable key={k} onPress={() => setSort(k)} style={({ pressed }) => [st.sort, sort === k && st.sortOn, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
            <T v="bodyMed" style={{ fontFamily: fonts.bodyMed }}>
              {k === 'top' ? 'Most applied' : 'Newest'}
            </T>
          </Pressable>
        ))}
      </Row>

      {loading && !data ? <ActivityIndicator color={colors.textDim} style={{ marginTop: space(8) }} /> : null}
      {error && !data ? (
        <T v="small" color={colors.loss}>
          Could not reach the Playbook server: {error}
        </T>
      ) : null}

      <View style={{ gap: space(3) }}>
        {sorted.map((t, i) => (
          <Animated.View key={t.id} entering={enter(i)}>
            <TemplateCard t={t} onPress={() => router.push({ pathname: '/template/[id]', params: { id: t.id } })} />
          </Animated.View>
        ))}
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sort: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderHi,
  },
  sortOn: { backgroundColor: colors.accent, borderColor: colors.ink, borderWidth: 1.25 },
});
