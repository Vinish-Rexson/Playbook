import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
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
import { colors, gradients, radius, space } from './theme';

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
  const pad = padded ? { paddingHorizontal: space(5) } : null;
  return (
    <SafeAreaView edges={['top']} style={s.screen}>
      <LinearGradient colors={gradients.hero} style={s.glow} pointerEvents="none" />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { paddingBottom: space(28), paddingTop: space(2) }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textDim} />
            ) : undefined
          }>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style, glow }: { children: ReactNode; style?: StyleProp<ViewStyle>; glow?: boolean }) {
  return (
    <View style={[s.card, glow && s.cardGlow, style]}>
      <LinearGradient colors={gradients.card} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  size?: 'md' | 'lg';
};

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style, size = 'lg' }: ButtonProps) {
  const off = disabled || loading;
  const h = size === 'lg' ? 56 : 44;
  const content = (
    <View style={[s.btnInner, { height: h }]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.text} />
      ) : (
        <>
          {icon}
          <T v="h3" color={variant === 'danger' ? colors.loss : '#fff'} style={{ fontSize: size === 'lg' ? 17 : 15 }}>
            {title}
          </T>
        </>
      )}
    </View>
  );
  return (
    <Pressable
      disabled={off}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        s.btn,
        variant === 'secondary' && s.btnSecondary,
        variant === 'ghost' && s.btnGhost,
        variant === 'danger' && s.btnDanger,
        { opacity: off ? 0.5 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
        style,
      ]}>
      {variant === 'primary' ? (
        <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btnGradient}>
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Pressable>
  );
}

export function Pill({ label, color, bg }: { label: string; color: string; bg?: string }) {
  return (
    <View style={[s.pill, { backgroundColor: bg ?? `${color}1F`, borderColor: `${color}55` }]}>
      <T v="label" color={color} style={{ letterSpacing: 0.6 }}>
        {label}
      </T>
    </View>
  );
}

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'profit' | 'loss' | 'primary' }) {
  const c = tone === 'profit' ? colors.profit : tone === 'loss' ? colors.loss : tone === 'primary' ? colors.primary : colors.textDim;
  return (
    <View style={[s.chip, { borderColor: `${c}40`, backgroundColor: `${c}14` }]}>
      <T v="small" color={c} style={{ fontFamily: 'Inter_600SemiBold' }}>
        {label}
      </T>
    </View>
  );
}

export function Avatar({ emoji, size = 44 }: { emoji?: string; size?: number }) {
  return (
    <LinearGradient
      colors={gradients.primary}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size / 2, padding: 2 }}>
      <View style={[s.avatarInner, { borderRadius: size / 2 }]}>
        <T style={{ fontSize: size * 0.5, lineHeight: size * 0.62 }}>{emoji ?? '🦊'}</T>
      </View>
    </LinearGradient>
  );
}

export function Row({ children, style, gap = 8 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

/** Back arrow + optional title and step dots, for pushed screens. */
export function Header({ title, onBack, step }: { title?: string; onBack: () => void; step?: { at: number; of: number } }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space(2), marginBottom: space(5), minHeight: 44 }}>
      <Pressable hitSlop={12} onPress={onBack} style={s.backBtn}>
        <ArrowLeft size={20} color={colors.text} />
      </Pressable>
      {title ? (
        <T v="h3" style={{ flex: 1, textAlign: 'center' }}>
          {title}
        </T>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <Row gap={6} style={{ width: 40, justifyContent: 'flex-end' }}>
        {step
          ? Array.from({ length: step.of }, (_, i) => (
              <View
                key={i}
                style={{
                  width: i === step.at ? 14 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i <= step.at ? colors.cyan : colors.borderHi,
                }}
              />
            ))
          : null}
      </Row>
    </Row>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: space(3) }} />;
}

export function KV({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
      <T v="small">{k}</T>
      <T v="num" color={color} style={{ fontSize: 15 }}>
        {v}
      </T>
    </Row>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
    overflow: 'hidden',
  },
  cardGlow: { borderColor: '#3A3270' },
  btn: { borderRadius: radius.md, overflow: 'hidden' },
  btnGradient: { borderRadius: radius.md },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: space(5) },
  btnSecondary: { backgroundColor: colors.cardHi, borderWidth: 1, borderColor: colors.borderHi },
  btnGhost: { backgroundColor: 'transparent' },
  btnDanger: { backgroundColor: '#FF5C7A14', borderWidth: 1, borderColor: '#FF5C7A55' },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, alignSelf: 'flex-start' },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm, borderWidth: 1 },
  avatarInner: { flex: 1, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.cardHi,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
