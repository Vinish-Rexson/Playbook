// Discover's market card: live ETH / SOL price with a real price chart (1D to 1Y). Drag across it to read
// any point.
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Defs, Line, LinearGradient as SvgGradient, Path, Stop, Circle } from 'react-native-svg';

import { NETWORK_DOT } from '@/components/NetworkSwitch';
import { useCandles } from '@/hooks/useCandles';
import { usePrice } from '@/hooks/usePrice';
import type { Timeframe } from '@/lib/api';
import { fmtTime } from '@/lib/chartMath';
import { usd } from '@/lib/pricing';
import { CHAINS, NETWORKS, type Chain } from '@/lib/constants';
import { Row } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, fonts, radius, space } from '@/ui/theme';

const RANGES: { label: string; tf: Timeframe; n: number }[] = [
  { label: '1D', tf: '15m', n: 96 },
  { label: '1W', tf: '1h', n: 168 },
  { label: '1M', tf: '6h', n: 120 },
  { label: '1Y', tf: '1d', n: 350 },
];
const H = 150;

export function MarketCard() {
  const [chain, setChain] = useState<Chain>('base');
  const [range, setRange] = useState(RANGES[0]);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const live = usePrice(chain);
  const all = useCandles(chain, range.tf);
  const data = useMemo(() => (all ? all.slice(-range.n) : null), [all, range.n]);

  const geo = useMemo(() => {
    if (!data || data.length < 2 || !width) return null;
    const closes = data.map((d) => d.c);
    if (live) closes[closes.length - 1] = live.price;
    const lo = Math.min(...closes);
    const hi = Math.max(...closes);
    const pad = (hi - lo) * 0.08 || hi * 0.01;
    const x = (i: number) => (i / (closes.length - 1)) * width;
    const y = (p: number) => 6 + ((hi + pad - p) / (hi - lo + 2 * pad)) * (H - 12);
    const line = closes.map((c, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(c).toFixed(1)}`).join('');
    return { closes, x, y, line, area: `${line}L${width},${H}L0,${H}Z` };
  }, [data, width, live]);

  const pick = (px: number) => {
    if (!geo) return;
    const i = Math.round((px / width) * (geo.closes.length - 1));
    setHover(Math.max(0, Math.min(geo.closes.length - 1, i)));
  };
  // Scrub with one finger (React Native responder props on an overlay).
  const touch = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      Haptics.selectionAsync().catch(() => {});
      pick(e.nativeEvent.locationX);
    },
    onResponderMove: (e: GestureResponderEvent) => pick(e.nativeEvent.locationX),
    onResponderRelease: () => setHover(null),
    onResponderTerminate: () => setHover(null),
  };

  const first = geo?.closes[0];
  const shown = hover !== null && geo ? geo.closes[hover] : live?.price ?? geo?.closes.at(-1);
  const change = first && shown ? ((shown - first) / first) * 100 : null;
  const up = (change ?? 0) >= 0;
  const tone = up ? colors.profit : colors.loss;
  const since = range.label === '1D' ? 'vs 24h ago' : range.label === '1W' ? 'vs a week ago' : range.label === '1M' ? 'vs a month ago' : 'vs a year ago';

  return (
    <View style={st.card}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={st.seg}>
          {CHAINS.map((c) => (
            <Pressable
              key={c}
              onPress={() => {
                setChain(c);
                setHover(null);
              }}
              style={[st.segItem, c === chain && st.segOn]}>
              <View style={[st.dot, { backgroundColor: NETWORK_DOT[c] }]} />
              <T v="small" color={c === chain ? colors.text : colors.textDim} style={{ fontFamily: fonts.bodyMed }}>
                {NETWORKS[c].asset}
              </T>
            </Pressable>
          ))}
        </View>
        <Row gap={6}>
          <View style={[st.dot, { backgroundColor: live ? colors.profit : colors.textMute }]} />
          <T v="mono">{live ? 'Live · Flash' : 'Connecting'}</T>
        </Row>
      </Row>

      <T v="hero" style={{ marginTop: space(4) }}>
        {shown ? usd(shown) : '—'}
      </T>
      <Row gap={8} style={{ marginTop: 2 }}>
        {change !== null ? (
          <T v="num" color={tone} style={{ fontSize: 14 }}>
            {up ? '+' : '−'}
            {Math.abs(change).toFixed(2)}%
          </T>
        ) : null}
        <T v="small">{hover !== null && data ? fmtTime(data[hover].t, range.tf) : since}</T>
      </Row>

      <View style={{ height: H, marginTop: space(4) }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {geo ? (
          <>
            <Svg width={width} height={H}>
              <Defs>
                <SvgGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.ink} stopOpacity={0.08} />
                  <Stop offset="1" stopColor={colors.ink} stopOpacity={0} />
                </SvgGradient>
              </Defs>
              <Path d={geo.area} fill="url(#fill)" />
              <Path d={geo.line} stroke={colors.ink} strokeWidth={1.75} fill="none" strokeLinejoin="round" />
              {hover !== null ? (
                <>
                  <Line x1={geo.x(hover)} x2={geo.x(hover)} y1={0} y2={H} stroke={colors.textMute} strokeDasharray="3 4" />
                  <Circle cx={geo.x(hover)} cy={geo.y(geo.closes[hover])} r={6} fill={colors.accent} stroke={colors.ink} strokeWidth={1.5} />
                </>
              ) : (
                <Circle cx={geo.x(geo.closes.length - 1)} cy={geo.y(geo.closes.at(-1)!)} r={5} fill={colors.accent} stroke={colors.ink} strokeWidth={1.5} />
              )}
            </Svg>
            <View style={StyleSheet.absoluteFill} {...touch} />
          </>
        ) : (
          <ActivityIndicator color={colors.textDim} style={{ marginTop: H / 2 - 12 }} />
        )}
      </View>

      <View style={[st.seg, { marginTop: space(4), alignSelf: 'stretch' }]}>
        {RANGES.map((r) => (
          <Pressable key={r.label} onPress={() => setRange(r)} style={[st.segItem, { flex: 1, justifyContent: 'center' }, r.label === range.label && st.segOn]}>
            <T v="small" color={r.label === range.label ? colors.text : colors.textDim} style={{ fontFamily: fonts.bodyMed }}>
              {r.label}
            </T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: radius.xl, padding: space(5), borderWidth: 1.25, borderColor: colors.ink, backgroundColor: colors.card },
  seg: { flexDirection: 'row', padding: 3, gap: 2, borderRadius: radius.sm, backgroundColor: colors.cardHi },
  segItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm - 3 },
  segOn: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  dot: { width: 7, height: 7, borderRadius: 4 },
});