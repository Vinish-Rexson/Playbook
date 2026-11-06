// Domain components: rule strip, playbook card, status tag, stepper.
import * as Haptics from 'expo-haptics';
import { Minus, Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { NETWORK_DOT } from '@/components/NetworkSwitch';
import { NETWORKS } from '@/lib/constants';
import { durationLabel, entryTypeOf, pct } from '@/lib/pricing';
import type { OrderOptions, PositionStatus, TemplateWithMeta } from '@/lib/types';
import { Avatar, Pill, Row } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, radius, space } from '@/ui/theme';

type Rules = Pick<TemplateWithMeta, 'entryOffsetPct' | 'takeProfitPct' | 'stopLossPct'> &
  Partial<Pick<TemplateWithMeta, 'chain' | 'entryType' | 'twapMinutes'>>;

/** One line describing how the order is placed, e.g. "DCA over 1h in 6 slices · protection always on". */
export function orderSummary(t: Partial<OrderOptions> & Pick<TemplateWithMeta, 'entryOffsetPct'>) {
  const type = entryTypeOf(t);
  const first =
    type === 'twap'
      ? `DCA over ${durationLabel(t.twapMinutes ?? 60)} in ${t.twapSlices ?? 6} slices${t.entryOffsetPct < 0 ? `, at or below ${pct(t.entryOffsetPct)}` : ''}`
      : type === 'limit'
        ? `Limit buy, ${t.entryExpiryHours ? `waits ${durationLabel(t.entryExpiryHours * 60)}` : 'waits until filled'}`
        : `Market buy, ${t.maxSlippagePct ? `${t.maxSlippagePct}% max slippage` : 'auto slippage'}`;
  return `${first} · protection ${t.bracketExpiryDays ? `for ${t.bracketExpiryDays}d` : 'always on'}`;
}

/** The three rules as one ticket-style strip: Buy · Take profit · Stop. */
export function RuleChips({ t }: { t: Rules }) {
  const type = entryTypeOf(t);
  const buy =
    type === 'twap'
      ? `DCA ${durationLabel(t.twapMinutes ?? 60)}`
      : type === 'limit'
        ? pct(t.entryOffsetPct)
        : 'Now';
  const cells = [
    { k: 'Buy', v: buy, c: colors.text },
    { k: 'Take profit', v: pct(t.takeProfitPct), c: colors.profit },
    { k: 'Stop', v: pct(-t.stopLossPct), c: colors.loss },
  ];
  return (
    <View style={st.strip}>
      {cells.map((x, i) => (
        <View key={x.k} style={[st.cell, i > 0 && st.cellLine]}>
          <T v="small" style={{ fontSize: 12 }}>
            {x.k}
          </T>
          <T v="num" color={x.c} style={{ fontSize: 15, marginTop: 2 }}>
            {x.v}
          </T>
        </View>
      ))}
    </View>
  );
}

/** Network tag: a status dot plus the pair (no icons). */
export function NetworkTag({ chain }: { chain?: TemplateWithMeta['chain'] }) {
  const list = !chain || chain === 'both' ? (['base', 'solana'] as const) : [chain];
  return (
    <Row gap={6}>
      {list.map((c) => (
        <Row key={c} gap={5}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: NETWORK_DOT[c] }} />
          <T v="mono">{NETWORKS[c].asset}</T>
        </Row>
      ))}
    </Row>
  );
}

export function TemplateCard({ t, onPress }: { t: TemplateWithMeta; onPress: () => void }) {
  const closed = t.stats.wins + t.stats.losses;
  const winRate = closed > 0 ? Math.round((100 * t.stats.wins) / closed) : null;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [st.card, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <Row gap={12}>
        <Avatar name={t.trader?.name} tone={t.trader?.avatar} size={40} />
        <View style={{ flex: 1 }}>
          <T v="h3" numberOfLines={1}>
            {t.name}
          </T>
          <T v="small" numberOfLines={1}>
            {t.trader?.name ?? 'Unknown'}
          </T>
        </View>
        <NetworkTag chain={t.chain} />
      </Row>
      {t.description ? (
        <T v="small" numberOfLines={2} style={{ marginTop: space(3) }}>
          {t.description}
        </T>
      ) : null}
      <View style={{ marginTop: space(3) }}>
        <RuleChips t={t} />
      </View>
      <Row style={{ justifyContent: 'space-between', marginTop: space(3) }}>
        <T v="mono">
          {t.stats.applies} applied · {winRate === null ? 'no closed trades' : `${winRate}% wins`}
        </T>
        <T v="mono" color={colors.text}>
          {t.cutPct}% creator cut
        </T>
      </Row>
    </Pressable>
  );
}

export const statusMeta: Record<PositionStatus, { label: string; color: string }> = {
  waiting: { label: 'Waiting for entry', color: colors.warn },
  filled: { label: 'Live, protected', color: colors.profit },
  take_profit: { label: 'Take profit hit', color: colors.profit },
  stop_loss: { label: 'Stopped out', color: colors.loss },
  cancelled: { label: 'Cancelled', color: colors.textMute },
  failed: { label: 'Failed', color: colors.loss },
  unprotected: { label: 'Protection ended', color: colors.warn },
  closing: { label: 'Closing', color: colors.warn },
  closed: { label: 'Closed by you', color: colors.textDim },
};

export function StatusPill({ status }: { status: PositionStatus }) {
  const m = statusMeta[status];
  return <Pill label={m.label} color={m.color} />;
}

export function Stepper({
  label,
  hint,
  value,
  onChange,
  step,
  min,
  max,
  format,
  tone = colors.text,
  sub,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  format: (v: number) => string;
  tone?: string;
  /** Second line under the value, e.g. the real price this rule means right now. */
  sub?: string;
}) {
  const set = (v: number) => {
    Haptics.selectionAsync().catch(() => {});
    onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)));
  };
  return (
    <Row style={st.stepper} gap={10}>
      <View style={{ flex: 1 }}>
        <T v="bodyMed">{label}</T>
        {hint ? <T v="small">{hint}</T> : null}
      </View>
      <Pressable hitSlop={8} onPress={() => set(value - step)} style={({ pressed }) => [st.stepBtn, pressed && st.stepBtnOn]} accessibilityLabel={`Lower ${label}`}>
        <Minus size={16} strokeWidth={1.75} color={colors.text} />
      </Pressable>
      <View style={{ width: 92, alignItems: 'center' }}>
        <T v="num" color={tone} style={{ textAlign: 'center', fontSize: 17 }}>
          {format(value)}
        </T>
        {sub ? (
          <T v="mono" style={{ textAlign: 'center', fontSize: 11 }} numberOfLines={1}>
            {sub}
          </T>
        ) : null}
      </View>
      <Pressable hitSlop={8} onPress={() => set(value + step)} style={({ pressed }) => [st.stepBtn, pressed && st.stepBtnOn]} accessibilityLabel={`Raise ${label}`}>
        <Plus size={16} strokeWidth={1.75} color={colors.text} />
      </Pressable>
    </Row>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(4),
  },
  strip: { flexDirection: 'row', borderRadius: radius.sm, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  cell: { flex: 1, paddingVertical: space(2), paddingHorizontal: space(3) },
  cellLine: { borderLeftWidth: 1, borderLeftColor: colors.border },
  stepper: { minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderHi },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnOn: { backgroundColor: colors.cardHi },
});


