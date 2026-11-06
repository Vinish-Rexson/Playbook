// Domain components: rule chips, template card, price ladder, status pill, stepper.
import { Minus, Plus, Users, Trophy } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { pct, usd } from '@/lib/pricing';
import type { PositionStatus, TemplateWithMeta } from '@/lib/types';
import { Avatar, Card, Chip, Pill, Row } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, radius, space } from '@/ui/theme';

const NETWORK_LABEL = { both: 'Base · Solana', base: 'ETH · Base', solana: 'SOL · Solana' } as const;

export function RuleChips({
  t,
}: {
  t: Pick<TemplateWithMeta, 'entryOffsetPct' | 'takeProfitPct' | 'stopLossPct'> & Partial<Pick<TemplateWithMeta, 'chain'>>;
}) {
  return (
    <Row gap={6} style={{ flexWrap: 'wrap' }}>
      <Chip tone="primary" label={t.entryOffsetPct < 0 ? `Buy ${pct(t.entryOffsetPct)}` : 'Buy now'} />
      <Chip tone="profit" label={`TP ${pct(t.takeProfitPct)}`} />
      <Chip tone="loss" label={`SL ${pct(-t.stopLossPct)}`} />
      {t.chain ? <Chip label={NETWORK_LABEL[t.chain]} /> : null}
    </Row>
  );
}

export function TemplateCard({ t, onPress }: { t: TemplateWithMeta; onPress: () => void }) {
  const winRate = t.stats.wins + t.stats.losses > 0 ? Math.round((100 * t.stats.wins) / (t.stats.wins + t.stats.losses)) : null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.985 : 1 }] })}>
      <Card style={{ gap: space(3) }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={10} style={{ flex: 1 }}>
            <Avatar emoji={t.trader?.avatar} size={40} />
            <View style={{ flex: 1 }}>
              <T v="h2" numberOfLines={1}>
                {t.name}
              </T>
              <T v="small" numberOfLines={1}>
                by {t.trader?.name ?? 'Unknown'} · @{t.trader?.handle ?? 'anon'}
              </T>
            </View>
          </Row>
          <View style={st.cutBadge}>
            <T v="label" color={colors.cyan}>
              {t.cutPct}% cut
            </T>
          </View>
        </Row>
        <T v="body" numberOfLines={2}>
          {t.description}
        </T>
        <RuleChips t={t} />
        <Row gap={16}>
          <Row gap={6}>
            <Users size={14} color={colors.textMute} />
            <T v="small">{t.stats.applies} applied</T>
          </Row>
          <Row gap={6}>
            <Trophy size={14} color={colors.textMute} />
            <T v="small">{winRate === null ? 'No closed trades yet' : `${winRate}% wins`}</T>
          </Row>
        </Row>
      </Card>
    </Pressable>
  );
}

/** Vertical price ladder: take-profit, entry, now and stop-loss placed to scale. */
export function PriceLadder({ now, entry, tp, sl, asset = 'ETH' }: { now: number; entry: number; tp: number; sl: number; asset?: string }) {
  const hi = Math.max(tp, now);
  const lo = Math.min(sl, now);
  const span = hi - lo || 1;
  const H = 190;
  const y = (p: number) => ((hi - p) / span) * (H - 24) + 12;
  const marks = [
    { label: 'Take profit', price: tp, color: colors.profit },
    { label: entry === now ? 'Buy now' : 'Buy at', price: entry, color: colors.primary },
    { label: 'Stop-loss', price: sl, color: colors.loss },
  ];
  return (
    <View style={{ height: H, flexDirection: 'row' }}>
      <View style={{ width: 28, alignItems: 'center' }}>
        <View style={[st.rail, { top: y(tp), height: Math.max(2, y(entry) - y(tp)), backgroundColor: `${colors.profit}55` }]} />
        <View style={[st.rail, { top: y(entry), height: Math.max(2, y(sl) - y(entry)), backgroundColor: `${colors.loss}55` }]} />
        {marks.map((m) => (
          <View key={m.label} style={[st.dot, { top: y(m.price) - 6, backgroundColor: m.color }]} />
        ))}
        {entry !== now && <View style={[st.nowDot, { top: y(now) - 5 }]} />}
      </View>
      <View style={{ flex: 1 }}>
        {marks.map((m) => (
          <Row key={m.label} style={[st.markRow, { top: y(m.price) - 11 }]}>
            <T v="small" color={m.color} style={{ fontFamily: 'Inter_600SemiBold' }}>
              {m.label}
            </T>
            <T v="num" style={{ fontSize: 15 }}>
              {usd(m.price)}
            </T>
          </Row>
        ))}
        {entry !== now && (
          <Row style={[st.markRow, { top: y(now) - 11 }]}>
            <T v="small" color={colors.textMute}>
              {asset} now
            </T>
            <T v="small" color={colors.textMute}>
              {usd(now)}
            </T>
          </Row>
        )}
      </View>
    </View>
  );
}

export const statusMeta: Record<PositionStatus, { label: string; color: string }> = {
  waiting: { label: 'Waiting for entry', color: colors.warn },
  filled: { label: 'Live · protected', color: colors.cyan },
  take_profit: { label: 'Take profit hit', color: colors.profit },
  stop_loss: { label: 'Stopped out', color: colors.loss },
  cancelled: { label: 'Cancelled', color: colors.textMute },
  failed: { label: 'Failed', color: colors.loss },
  unprotected: { label: 'Protection ended', color: colors.warn },
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
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)));
  return (
    <Row style={st.stepper}>
      <View style={{ flex: 1 }}>
        <T v="bodyMed">{label}</T>
        {hint ? <T v="small">{hint}</T> : null}
      </View>
      <Pressable hitSlop={8} onPress={() => set(value - step)} style={st.stepBtn}>
        <Minus size={18} color={colors.text} />
      </Pressable>
      <View style={{ minWidth: 86, alignItems: 'center' }}>
        <T v="num" color={tone} style={{ textAlign: 'center', fontSize: 18 }}>
          {format(value)}
        </T>
        {sub ? (
          <T v="small" style={{ textAlign: 'center', fontSize: 11 }}>
            {sub}
          </T>
        ) : null}
      </View>
      <Pressable hitSlop={8} onPress={() => set(value + step)} style={st.stepBtn}>
        <Plus size={18} color={colors.text} />
      </Pressable>
    </Row>
  );
}

const st = StyleSheet.create({
  cutBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: '#3DD6FF14',
    borderWidth: 1,
    borderColor: '#3DD6FF44',
  },
  rail: { position: 'absolute', width: 4, borderRadius: 2 },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.bg },
  nowDot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: colors.text, opacity: 0.6 },
  markRow: { position: 'absolute', left: 0, right: 0, justifyContent: 'space-between' },
  stepper: {
    paddingVertical: space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.cardHi,
    borderWidth: 1,
    borderColor: colors.borderHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
