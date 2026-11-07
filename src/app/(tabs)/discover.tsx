import { router } from 'expo-router';
import { Flame, Search, Sparkles, UserCheck, type LucideIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { MarketCard } from '@/components/charts/MarketCard';
import { TemplateCard } from '@/components/Playbook';
import { UpdateBanner } from '@/components/UpdateBanner';
import { useFetch } from '@/hooks/useFetch';
import { isFollowing, useSocial, votesFor } from '@/hooks/useSocial';
import { api } from '@/lib/api';
import type { TemplateWithMeta } from '@/lib/types';
import { Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, DUR, EASE, fonts, radius, space } from '@/ui/theme';

type Tab = 'new' | 'hot' | 'following';
const GUTTER = space(5);
const GAP = space(3);
// Floating tab bar: 64 high, above the bottom inset (at least 12). The page stops this far above it.
const NAV_H = 64;
const NAV_GAP = space(3);
const TABS: { key: Tab; label: string; icon: LucideIcon; hint: string }[] = [
  {
    key: 'new',
    label: 'Newest',
    icon: Sparkles,
    hint: 'Just published by creators',
  },
  {
    key: 'hot',
    label: 'Hot picks',
    icon: Flame,
    hint: 'Most applied, best results and votes, fresh first',
  },
  {
    key: 'following',
    label: 'Following',
    icon: UserCheck,
    hint: 'Playbooks from creators you follow',
  },
];
const enter = (i: number) =>
  FadeInDown.delay(Math.min(i, 4) * 50)
    .duration(DUR.enter)
    .easing(Easing.bezier(...EASE));

/**
 * Hot picks: what people are applying and liking right now.
 *   applies (log-scaled, so one huge playbook does not swamp the list) + realized win rate (only once it has
 *   closed trades) + vote balance + open positions + a freshness boost that fades over about two weeks.
 */
function hotScore(t: TemplateWithMeta, netVotes: number, now: number) {
  const closed = t.stats.wins + t.stats.losses;
  const winRate = closed > 0 ? t.stats.wins / closed : 0.5;
  const ageDays = Math.max(0, (now - t.createdAt) / 86_400_000);
  return (
    Math.log2(1 + t.stats.applies) * 3 +
    (closed > 0 ? (winRate - 0.5) * 6 * Math.min(1, closed / 5) : 0) +
    Math.sign(netVotes) * Math.log2(1 + Math.abs(netVotes)) * 1.5 +
    Math.log2(1 + t.stats.open) +
    4 * Math.exp(-ageDays / 14)
  );
}

export default function Discover() {
  const { data, loading, error } = useFetch(() => api.templates(), [], 15_000);
  const social = useSocial();
  const [tab, setTab] = useState<Tab>('new');
  const { width: screen, height: windowHeight } = useWindowDimensions();
  // One card plus a peek of the next on phones; capped so tablets show several.
  const cardWidth = Math.min(screen - GUTTER * 2 - 40, 340);
  // Fixed per phone (from its screen height, never from what is below it): taller phones get a taller chart.
  const insets = useSafeAreaInsets();
  const chartHeight = Math.round(Math.max(96, Math.min(180, windowHeight * 0.17)));

  const list = useMemo(() => data?.templates ?? [], [data]);
  const newest = useMemo(() => [...list].sort((a, b) => b.createdAt - a.createdAt), [list]);
  const hot = useMemo(() => {
    // Freshness is measured against the newest playbook (keeps rendering pure and the ranking stable).
    const now = list.reduce((m, t) => Math.max(m, t.createdAt), 0);
    return list
      .map((t) => {
        const v = votesFor(social, t.id);
        return { t, score: hotScore(t, v.up - v.down, now) };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.t);
  }, [list, social]);
  const following = useMemo(() => newest.filter((t) => isFollowing(social, t.creator)), [newest, social]);

  const items = tab === 'new' ? newest : tab === 'hot' ? hot : following;
  const counts: Record<Tab, number> = {
    new: newest.length,
    hot: hot.length,
    following: following.length,
  };
  const active = TABS.find((x) => x.key === tab) ?? TABS[0];

  return (
    <Screen scroll={false}>
      <Row
        style={{
          justifyContent: 'space-between',
          marginTop: space(3),
          marginBottom: space(4),
        }}>
        <T v="h1">Discover</T>
        <Pressable
          onPress={() => router.push('/search')}
          style={({ pressed }) => [st.iconBtn, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
          accessibilityLabel="Search creators">
          <Search size={18} strokeWidth={1.75} color={colors.text} />
        </Pressable>
      </Row>

      <UpdateBanner />
      <MarketCard chartHeight={chartHeight} />

      <View style={st.tabs} accessibilityRole="tablist">
        {TABS.map(({ key, label, icon: Icon }) => {
          const on = key === tab;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={({ pressed }) => [st.tab, on && st.tabOn, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}>
              <Icon size={14} strokeWidth={2} color={on ? colors.ink : colors.textDim} />
              <T
                v="small"
                color={on ? colors.ink : colors.textDim}
                style={{ fontFamily: on ? fonts.bodySemi : fonts.bodyMed }}
                numberOfLines={1}>
                {label}
              </T>
              {data && key !== 'hot' && counts[key] > 0 ? (
                <View style={[st.badge, on && st.badgeOn]}>
                  <T v="mono" color={on ? colors.onInk : colors.textDim} style={{ fontSize: 10 }}>
                    {counts[key]}
                  </T>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <T
        v="small"
        style={{
          marginTop: space(2),
          marginBottom: space(3),
          marginLeft: space(1),
        }}>
        {active.hint}
      </T>

      {/* Everything below the tabs lives above the floating tab bar; the page itself does not scroll. */}
      <View
        style={{
          flex: 1,
          paddingBottom: NAV_H + Math.max(insets.bottom, space(3)) + NAV_GAP,
        }}>
        {loading && !data ? <ActivityIndicator color={colors.textDim} style={{ marginTop: space(8) }} /> : null}
        {error && !data ? (
          <T v="small" color={colors.loss}>
            Could not reach the Playbook server: {error}
          </T>
        ) : null}

        {data && items.length === 0 ? (
          <View style={st.empty}>
            <T v="small" style={{ textAlign: 'center' }}>
              {tab === 'following'
                ? social.follows.length
                  ? 'The creators you follow have no playbooks yet.'
                  : 'Tap Follow on any playbook to keep its creator here.'
                : 'No playbooks yet. Create the first one.'}
            </T>
          </View>
        ) : null}

        {/* Keyed by tab so the row resets to the start and re-enters when you switch. */}
        {items.length ? (
          <ScrollView
            key={tab}
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={cardWidth + GAP}
            snapToAlignment="start"
            style={{ marginHorizontal: -GUTTER, flexGrow: 0 }}
            // Top padding leaves room for the Hot picks rank badges (same on every tab, so nothing jumps).
            contentContainerStyle={{
              paddingHorizontal: GUTTER,
              gap: GAP,
              paddingTop: 10,
            }}>
            {items.map((t, i) => (
              <Animated.View key={t.id} entering={enter(i)} style={{ width: cardWidth }}>
                <TemplateCard
                  t={t}
                  onPress={() =>
                    router.push({
                      pathname: '/template/[id]',
                      params: { id: t.id },
                    })
                  }
                />
                {tab === 'hot' && i < 3 ? (
                  <View style={st.rank} pointerEvents="none">
                    <T v="mono" color={colors.ink} style={{ fontFamily: fonts.monoMed }}>
                      #{i + 1}
                    </T>
                  </View>
                ) : null}
              </Animated.View>
            ))}
          </ScrollView>
        ) : null}
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
  tabs: {
    flexDirection: 'row',
    marginTop: space(6),
    padding: 4,
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.cardHi,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 40,
    borderRadius: radius.pill,
  },
  tabOn: {
    backgroundColor: colors.accent,
    borderWidth: 1.25,
    borderColor: colors.ink,
  },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  badgeOn: { backgroundColor: colors.ink },
  rank: {
    position: 'absolute',
    top: -10,
    right: 14,
    paddingHorizontal: 8,
    height: 22,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    borderWidth: 1.25,
    borderColor: colors.ink,
  },
  empty: {
    paddingVertical: space(8),
    paddingHorizontal: space(5),
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderHi,
    backgroundColor: colors.card,
  },
});
