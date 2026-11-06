// Floating ink tab bar (Creso-style): icons only, the active tab gets a white icon and a lime marker
// that slides between tabs.
import * as Haptics from 'expo-haptics';
import { Activity, Compass, Plus, Trophy, UserRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, DUR, EASE, radius, space } from '@/ui/theme';

const ICONS: Record<string, typeof Compass> = { discover: Compass, leaderboard: Trophy, create: Plus, positions: Activity, profile: UserRound };
const LABELS: Record<string, string> = { discover: 'Discover', leaderboard: 'Leaderboard', create: 'Create', positions: 'Positions', profile: 'Wallet' };

type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  onSelect: (routeKey: string) => void;
};

export function TabBar({ state, onSelect }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const [w, setW] = useState(0);
  const slot = w / state.routes.length;
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withTiming(state.index * slot, { duration: DUR.menu + 60, easing: Easing.bezier(...EASE) });
  }, [state.index, slot, x]);
  const marker = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View pointerEvents="box-none" style={[st.wrap, { paddingBottom: Math.max(insets.bottom, space(3)) }]}>
      <View style={st.bar} onLayout={(e) => setW(e.nativeEvent.layout.width - space(4))}>
        {w ? (
          <Animated.View style={[st.markerSlot, { width: slot }, marker]}>
            <View style={st.marker} />
          </Animated.View>
        ) : null}
        {state.routes.map((r, i) => {
          const Icon = ICONS[r.name] ?? Compass;
          const on = state.index === i;
          return (
            <Pressable
              key={r.key}
              accessibilityRole="tab"
              accessibilityLabel={LABELS[r.name] ?? r.name}
              accessibilityState={{ selected: on }}
              onPress={() => {
                if (on) return;
                Haptics.selectionAsync().catch(() => {});
                onSelect(r.key);
              }}
              style={({ pressed }) => [st.item, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
              <Icon size={22} strokeWidth={1.75} color={on ? colors.onInk : 'rgba(255,255,255,0.5)'} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space(5) },
  bar: {
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space(2),
  },
  item: { flex: 1, height: 64, alignItems: 'center', justifyContent: 'center' },
  markerSlot: { position: 'absolute', left: space(2), bottom: 9, alignItems: 'center' },
  marker: { width: 18, height: 3, borderRadius: 2, backgroundColor: colors.accent },
});
