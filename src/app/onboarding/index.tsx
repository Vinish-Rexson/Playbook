import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronRight, Download, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import { Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, DUR, EASE, fonts, radius, space } from '@/ui/theme';

const rise = (i: number) => FadeInDown.delay(i * 60).duration(DUR.enter).easing(Easing.bezier(...EASE));

// A fixed price path for the illustration: dips to the buy line, then climbs toward take profit.
const PATH = [0.55, 0.6, 0.52, 0.58, 0.66, 0.74, 0.7, 0.62, 0.48, 0.4, 0.36, 0.3, 0.33, 0.24, 0.2];

/** The welcome "object": a playbook ticket with a price line, buy level, and take-profit / stop zones. */
function PlaybookTicket() {
  const [w, setW] = useState(0);
  const H = 150;
  const x = (i: number) => (i / (PATH.length - 1)) * w;
  const y = (v: number) => v * H;
  const d = PATH.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  return (
    <View style={st.ticket}>
      <Row style={st.ticketHead}>
        <T v="small" color={colors.onInk} style={{ fontFamily: fonts.bodyMed, flex: 1 }}>
          Dip Catcher
        </T>
        <T v="mono" color={colors.accent}>
          Buy −2% · TP +5% · SL −3%
        </T>
      </Row>
      <View style={{ height: H, margin: space(4) }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w ? (
          <Svg width={w} height={H}>
            <Rect x={0} y={y(0.1)} width={w} height={y(0.62) - y(0.1)} fill={colors.profit} opacity={0.1} />
            <Rect x={0} y={y(0.62)} width={w} height={y(0.86) - y(0.62)} fill={colors.loss} opacity={0.1} />
            <Line x1={0} x2={w} y1={y(0.1)} y2={y(0.1)} stroke={colors.profit} strokeWidth={1.25} />
            <Line x1={0} x2={w} y1={y(0.62)} y2={y(0.62)} stroke={colors.ink} strokeWidth={1.25} strokeDasharray="4 3" />
            <Line x1={0} x2={w} y1={y(0.86)} y2={y(0.86)} stroke={colors.loss} strokeWidth={1.25} />
            <Path d={d} stroke={colors.ink} strokeWidth={2} fill="none" strokeLinejoin="round" />
            <Rect x={x(9) - 6} y={y(0.4) - 6} width={12} height={12} rx={6} fill={colors.accent} stroke={colors.ink} strokeWidth={1.5} />
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

function Option({ icon, title, sub, onPress, accent }: { icon: React.ReactNode; title: string; sub: string; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [st.option, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <View style={[st.optionIcon, accent ? { backgroundColor: colors.accent, borderColor: colors.ink } : null]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <T v="h3">{title}</T>
        <T v="small">{sub}</T>
      </View>
      <ChevronRight size={18} strokeWidth={1.75} color={colors.textMute} />
    </Pressable>
  );
}

export default function Welcome() {
  return (
    <Screen>
      <Animated.View entering={rise(0)} style={{ marginTop: space(4) }}>
        <Row gap={8}>
          <View style={st.mark} />
          <T v="h3">playbook</T>
        </Row>
      </Animated.View>

      <Animated.View entering={rise(1)} style={{ marginTop: space(8) }}>
        <T v="hero">Copy a trader’s rules.{'\n'}Keep your keys.</T>
        <T v="body" style={{ marginTop: space(3) }}>
          Apply a published playbook to your own wallet. Every trade has a take-profit and a stop, executed by Definitive
          Flash on Base or Solana.
        </T>
      </Animated.View>

      <Animated.View entering={rise(2)} style={{ marginTop: space(7) }}>
        <PlaybookTicket />
      </Animated.View>

      <Animated.View entering={rise(3)} style={{ marginTop: space(7), gap: space(3) }}>
        <Option
          accent
          icon={<Plus size={20} strokeWidth={1.75} color={colors.ink} />}
          title="Create"
          sub="A new wallet, with a recovery phrase"
          onPress={() => router.push('/onboarding/create')}
        />
        <Option
          icon={<Download size={18} strokeWidth={1.75} color={colors.ink} />}
          title="Import"
          sub="An existing phrase or private key"
          onPress={() => router.push('/onboarding/import')}
        />
        <T v="mono" style={{ textAlign: 'center', marginTop: space(1) }}>
          Self-custody. Keys stay encrypted on this phone.
        </T>
      </Animated.View>
    </Screen>
  );
}

const st = StyleSheet.create({
  mark: { width: 18, height: 18, borderRadius: 5, backgroundColor: colors.ink, borderBottomWidth: 5, borderBottomColor: colors.accent },
  ticket: { borderRadius: radius.lg, borderWidth: 1.25, borderColor: colors.ink, backgroundColor: colors.card, overflow: 'hidden' },
  ticketHead: { backgroundColor: colors.ink, paddingHorizontal: space(4), paddingVertical: space(3) },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    padding: space(4),
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1.25,
    borderColor: colors.borderHi,
  },
});
