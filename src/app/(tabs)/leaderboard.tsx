// Playbook leaderboard: rank by realized return, win rate, applies or volume. Only playbooks with data for the
// chosen measure are ranked; the rest are listed below as not ranked yet.
import { router } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { NetworkTag } from '@/components/Playbook';
import { useFetch } from '@/hooks/useFetch';
import { api } from '@/lib/api';
import { pct, usd } from '@/lib/pricing';
import type { TemplateWithMeta } from '@/lib/types';
import { Avatar, Card, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, DUR, EASE, fonts, radius, space } from '@/ui/theme';

type Metric = 'return' | 'winrate' | 'applied' | 'volume';

const METRICS: { key: Metric; label: string }[] = [
  { key: 'return', label: 'Return' },
  { key: 'winrate', label: 'Win rate' },
  { key: 'applied', label: 'Applied' },
  { key: 'volume', label: 'Volume' },
];

const closed = (t: TemplateWithMeta) => t.stats.wins + t.stats.losses;

/** Score for a metric, or null when the playbook has no data for it yet. */
function score(t: TemplateWithMeta, m: Metric): number | null {
  if (m === 'return') return t.stats.closedUsd > 0 ? (t.stats.pnlUsd / t.stats.closedUsd) * 100 : null;
  if (m === 'winrate') return closed(t) ? (100 * t.stats.wins) / closed(t) : null;
  if (m === 'applied') return t.stats.applies || null;
  return t.stats.volumeUsd || null;
}

function shown(t: TemplateWithMeta, m: Metric, v: number) {
  if (m === 'return') return { value: pct(v, 2), sub: `${closed(t)} closed`, color: v >= 0 ? colors.profit : colors.loss };
  if (m === 'winrate') return { value: `${Math.round(v)}%`, sub: `${t.stats.wins} of ${closed(t)}`, color: colors.text };
  if (m === 'applied') return { value: String(v), sub: `${t.stats.open} open`, color: colors.text };
  return { value: usd(v, 0), sub: `${t.stats.applies} applies`, color: colors.text };
}

const rise = (i: number) => FadeInDown.delay(Math.min(i, 5) * 50).duration(DUR.enter).easing(Easing.bezier(...EASE));

function Rank({ n }: { n: number }) {
  const top = n === 1;
  return (
    <View style={[st.rank, top ? { backgroundColor: colors.accent, borderColor: colors.ink } : n <= 3 ? { borderColor: colors.ink } : null]}>
      <T v="mono" color={colors.text} style={{ fontFamily: fonts.monoMed }}>
        {n}
      </T>
    </View>
  );
}

export default function Leaderboard() {
  const { data, loading, error, refreshing, reload } = useFetch(() => api.templates(), [], 20_000);
  const [metric, setMetric] = useState<Metric>('return');

  const list = data?.templates ?? [];
  const ranked = list
    .map((t) => ({ t, s: score(t, metric) }))
    .filter((x): x is { t: TemplateWithMeta; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s || b.t.stats.applies - a.t.stats.applies);
  const unranked = list.filter((t) => score(t, metric) === null);

  return (
    <Screen onRefresh={reload} refreshing={refreshing}>
      <Row style={{ justifyContent: 'space-between', marginTop: space(3), marginBottom: space(5) }}>
        <T v="h1">Leaderboard</T>
        <Pressable onPress={() => router.push('/search')} style={({ pressed }) => [st.iconBtn, { transform: [{ scale: pressed ? 0.94 : 1 }] }]} accessibilityLabel="Search creators">
          <Search size={18} strokeWidth={1.75} color={colors.text} />
        </Pressable>
      </Row>

      <View style={st.seg}>
        {METRICS.map((m) => (
          <Pressable key={m.key} onPress={() => setMetric(m.key)} style={[st.segItem, metric === m.key && st.segOn]}>
            <T v="small" color={metric === m.key ? colors.text : colors.textDim} style={{ fontFamily: fonts.bodyMed }}>
              {m.label}
            </T>
          </Pressable>
        ))}
      </View>
      <T v="mono" style={{ marginTop: space(2) }}>
        {metric === 'return'
          ? 'Realized profit ÷ USDC applied, closed trades only'
          : metric === 'winrate'
            ? 'Take profits ÷ closed trades'
            : metric === 'applied'
              ? 'Times applied, all networks'
              : 'USDC applied, all networks'}
      </T>

      {loading && !data ? <ActivityIndicator color={colors.textDim} style={{ marginTop: space(8) }} /> : null}
      {error && !data ? (
        <T v="small" color={colors.loss} style={{ marginTop: space(4) }}>
          {error}
        </T>
      ) : null}

      {data ? (
        <>
          {ranked.length ? (
            <Card style={{ marginTop: space(4), paddingVertical: space(1) }}>
              {ranked.map(({ t, s }, i) => {
                const d = shown(t, metric, s);
                return (
                  <Animated.View key={t.id} entering={rise(i)}>
                    <Pressable
                      onPress={() => router.push({ pathname: '/template/[id]', params: { id: t.id } })}
                      style={({ pressed }) => [st.row, i > 0 && st.line, pressed && { opacity: 0.6 }]}>
                      <Rank n={i + 1} />
                      <Avatar name={t.trader?.name} tone={t.trader?.avatar} size={36} />
                      <View style={{ flex: 1 }}>
                        <T v="bodyMed" numberOfLines={1}>
                          {t.name}
                        </T>
                        <Row gap={8}>
                          <T v="mono" numberOfLines={1}>
                            {t.trader?.name ?? 'Unknown'}
                          </T>
                          <NetworkTag chain={t.chain} />
                        </Row>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <T v="num" color={d.color}>
                          {d.value}
                        </T>
                        <T v="mono">{d.sub}</T>
                      </View>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </Card>
          ) : (
            <Card style={{ marginTop: space(4), alignItems: 'center', paddingVertical: space(8), gap: space(2) }}>
              <T v="h3">Nothing ranked yet</T>
              <T v="small" style={{ textAlign: 'center' }}>
                {metric === 'return' || metric === 'winrate'
                  ? 'Playbooks rank here once applied trades close at a take profit or stop'
                  : 'Playbooks rank here once someone applies them'}
              </T>
            </Card>
          )}

          {unranked.length ? (
            <>
              <T v="small" style={{ marginTop: space(6), marginBottom: space(2) }}>
                Not ranked yet
              </T>
              <Card style={{ paddingVertical: space(1) }}>
                {unranked.map((t, i) => (
                  <Pressable
                    key={t.id}
                    onPress={() => router.push({ pathname: '/template/[id]', params: { id: t.id } })}
                    style={({ pressed }) => [st.row, i > 0 && st.line, pressed && { opacity: 0.6 }]}>
                    <Avatar name={t.trader?.name} tone={t.trader?.avatar} size={32} />
                    <T v="bodyMed" style={{ flex: 1 }} numberOfLines={1}>
                      {t.name}
                    </T>
                    <T v="mono">{t.stats.applies} applied</T>
                  </Pressable>
                ))}
              </Card>
            </>
          ) : null}
        </>
      ) : null}
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
  seg: { flexDirection: 'row', padding: 3, gap: 2, borderRadius: radius.sm, backgroundColor: colors.cardHi },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm - 3 },
  segOn: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 64 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderHi },
  rank: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1.25,
    borderColor: colors.borderHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
