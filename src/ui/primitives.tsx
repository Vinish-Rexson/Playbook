import * as Haptics from 'expo-haptics';
import { ArrowLeft } from 'lucide-react-native';
import { createContext, type ReactNode, useContext, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { T } from './Text';
import { colors, fonts, radius, space } from './theme';

/** Lets an interactive child (a chart being dragged) stop the page from scrolling while the finger is down. */
const ScrollLock = createContext<(locked: boolean) => void>(() => {});
export const useScrollLock = () => useContext(ScrollLock);

export function Screen({
  children,
  scroll = true,
  onRefresh,
  refreshing = false,
  padded = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  padded?: boolean;
}) {
  const [locked, setLocked] = useState(false);
  const pad = padded ? { paddingHorizontal: space(5) } : null;
  return (
    <ScrollLock.Provider value={setLocked}>
      <SafeAreaView edges={['top']} style={s.screen}>
        {scroll ? (
          <ScrollView
            scrollEnabled={!locked}
            contentContainerStyle={[pad, { paddingBottom: space(32), paddingTop: space(2) }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              onRefresh ? (
                <RefreshControl enabled={!locked} refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textDim} />
              ) : undefined
            }>
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, pad]}>{children}</View>
        )}
      </SafeAreaView>
    </ScrollLock.Provider>
  );
}

/** White card on paper with a hairline. `glow` draws the ink outline used for the one featured card. */
export function Card({ children, style, glow }: { children: ReactNode; style?: StyleProp<ViewStyle>; glow?: boolean }) {
  return <View style={[s.card, glow && s.cardFeatured, style]}>{children}</View>;
}

/** Ticket card: black header strip with a label, white body (the signature card). */
export function Ticket({ label, right, children, style }: { label: string; right?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.ticket, style]}>
      <Row style={s.ticketHead}>
        <T v="small" color={colors.onInk} style={{ fontFamily: fonts.bodyMed, flex: 1 }}>
          {label}
        </T>
        {right}
      </Row>
      <View style={s.ticketBody}>{children}</View>
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  size?: 'md' | 'lg';
};

const BTN: Record<NonNullable<ButtonProps['variant']>, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.ink, fg: colors.onInk },
  accent: { bg: colors.accent, fg: colors.ink, border: colors.ink },
  secondary: { bg: colors.card, fg: colors.text, border: colors.borderHi },
  ghost: { bg: 'transparent', fg: colors.text },
  danger: { bg: colors.lossSoft, fg: colors.loss, border: '#F0C9CB' },
};

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style, size = 'lg' }: ButtonProps) {
  const off = disabled || loading;
  const c = BTN[variant];
  return (
    <Pressable
      disabled={off}
      accessibilityRole="button"
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        s.btn,
        {
          height: size === 'lg' ? 52 : 40,
          backgroundColor: c.bg,
          borderWidth: c.border ? 1.25 : 0,
          borderColor: c.border,
          opacity: off ? 0.45 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <>
          {icon}
          <T v="h3" color={c.fg} style={{ fontSize: size === 'lg' ? 16 : 14 }}>
            {title}
          </T>
        </>
      )}
    </Pressable>
  );
}

/** Small status tag (radius 6, soft fill). */
export function Pill({ label, color, bg }: { label: string; color: string; bg?: string }) {
  return (
    <View style={[s.pill, { backgroundColor: bg ?? colors.cardHi }]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <T v="small" color={colors.text} style={{ fontFamily: fonts.bodyMed, fontSize: 12 }}>
        {label}
      </T>
    </View>
  );
}

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'profit' | 'loss' | 'primary' }) {
  const fg = tone === 'profit' ? colors.profit : tone === 'loss' ? colors.loss : colors.text;
  const bg = tone === 'profit' ? colors.profitSoft : tone === 'loss' ? colors.lossSoft : colors.cardHi;
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      <T v="mono" color={fg} style={{ fontFamily: fonts.monoMed }}>
        {label}
      </T>
    </View>
  );
}

// Monogram avatars (no emoji). The stored avatar value picks the tone; older emoji values map to one.
export const AVATAR_TONES = ['lime', 'ink', 'sand', 'sky', 'rose', 'mint'] as const;
const TONE: Record<(typeof AVATAR_TONES)[number], { bg: string; fg: string }> = {
  lime: { bg: colors.accent, fg: colors.ink },
  ink: { bg: colors.ink, fg: colors.onInk },
  sand: { bg: '#E8DEC8', fg: colors.ink },
  sky: { bg: '#D3E3F3', fg: colors.ink },
  rose: { bg: '#F3D8DC', fg: colors.ink },
  mint: { bg: '#D3EEDF', fg: colors.ink },
};
export const toneOf = (key?: string) => {
  if (key && key in TONE) return TONE[key as keyof typeof TONE];
  let h = 0;
  for (const ch of key ?? '') h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return TONE[AVATAR_TONES[h % AVATAR_TONES.length]];
};

export function Avatar({ name, tone, size = 44 }: { name?: string | null; tone?: string; size?: number }) {
  const t = toneOf(tone);
  const initials = (name ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
      <T v="h3" color={t.fg} style={{ fontSize: size * 0.38, lineHeight: size * 0.5 }}>
        {initials || '?'}
      </T>
    </View>
  );
}

export function Row({ children, style, gap = 8 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

/** Back arrow + optional title and step dots, for pushed screens. */
export function Header({ title, onBack, step }: { title?: string; onBack: () => void; step?: { at: number; of: number } }) {
  return (
    <Row style={{ marginTop: space(2), marginBottom: space(5), minHeight: 44 }} gap={12}>
      <Pressable hitSlop={12} onPress={onBack} style={s.backBtn} accessibilityLabel="Back">
        <ArrowLeft size={20} strokeWidth={1.75} color={colors.text} />
      </Pressable>
      <T v="h2" style={{ flex: 1 }}>
        {title ?? ''}
      </T>
      {step ? (
        <Row gap={6}>
          {Array.from({ length: step.of }, (_, i) => (
            <View
              key={i}
              style={{
                width: i === step.at ? 16 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i <= step.at ? colors.ink : colors.borderHi,
              }}
            />
          ))}
        </Row>
      ) : null}
    </Row>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderHi, marginVertical: space(3) }} />;
}

export function KV({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', minHeight: 32 }}>
      <T v="small">{k}</T>
      <T v="num" color={color} style={{ fontSize: 14 }}>
        {v}
      </T>
    </Row>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: space(5),
  },
  cardFeatured: { borderColor: colors.ink, borderWidth: 1.25 },
  ticket: { borderRadius: radius.md, borderWidth: 1.25, borderColor: colors.ink, backgroundColor: colors.card, overflow: 'hidden' },
  ticketHead: { backgroundColor: colors.ink, paddingHorizontal: space(3), paddingVertical: space(2) },
  ticketBody: { padding: space(3) },
  btn: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: space(6),
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
