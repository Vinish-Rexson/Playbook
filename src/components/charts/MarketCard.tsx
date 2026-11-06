// Discover's market card: live ETH / SOL price with a real price chart (1D to 1Y). Drag across it to read
// any point.
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Defs, Line, LinearGradient as SvgGradient, Path, Stop, Circle } from 'react-native-svg';

import { NETWORK_DOT } from '@/components/NetworkSwitch';
import { useCandles } from '@/hooks/useCandles';
import { usePrice } from '@/hooks/usePrice';
import type { Timeframe } from '@/lib/api';
import { fmtPrice, fmtTime } from '@/lib/chartMath';
import { CHAINS, NETWORKS, type Chain } from '@/lib/constants';
import { Row } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, radius, space } from '@/ui/theme';

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
  const net = NETWORKS[chain];

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

  return (
    <LinearGradient colors={['#1C1640', '#101528']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.card}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={6}>
          {CHAINS.map((c) => (
            <Pressable
              key={c}
              onPress={() => {
                setChain(c);
                setHover(null);
              }}
              style={[st.tab, c === chain && st.tabOn]}>
              <View style={[st.dot, { backgroundColor: NETWORK_DOT[c] }]} />
              <T v="small" color={c === chain ? colors.text : colors.textDim} style={{ fontFamily: 'Inter_600SemiBold' }}>
                {NETWORKS[c].asset} · {NETWORKS[c].name}
              </T>
            </Pressable>
          ))}
        </Row>
        <Row gap={6}>
          <View style={[st.dot, { backgroundColor: live ? colors.profit : colors.textMute }]} />
          <T v="small">{live ? 'Live' : '…'}</T>
        </Row>
      </Row>

      <Row style={{ alignItems: 'flex-end', marginTop: space(3) }} gap={10}>
        <T v="hero" style={{ fontSize: 34 }}>
          {shown ? fmtPrice(shown) : '—'}
        </T>
        {change !== null ? (
          <T v="num" color={tone} style={{ marginBottom: 6 }}>
            {up ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
          </T>
        ) : null}
      </Row>
      <T v="small">
        {hover !== null && data ? fmtTime(data[hover].t, range.tf) : `${net.asset} past ${range.label === '1D' ? 'day' : range.label === '1W' ? 'week' : range.label === '1M' ? 'month' : 'year'}`}
      </T>

      <View style={{ height: H, marginTop: space(3) }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {geo ? (
          <>
            <Svg width={width} height={H}>
              <Defs>
                <SvgGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={tone} stopOpacity={0.28} />
                  <Stop offset="1" stopColor={tone} stopOpacity={0} />
                </SvgGradient>
              </Defs>
              <Path d={geo.area} fill="url(#fill)" />
              <Path d={geo.line} stroke={tone} strokeWidth={2} fill="none" strokeLinejoin="round" />
              {hover !== null ? (
                <>
                  <Line x1={geo.x(hover)} x2={geo.x(hover)} y1={0} y2={H} stroke={colors.textMute} strokeDasharray="3 4" />
                  <Circle cx={geo.x(hover)} cy={geo.y(geo.closes[hover])} r={5} fill={tone} stroke={colors.bg} strokeWidth={2} />
                </>
              ) : (
                <Circle cx={geo.x(geo.closes.length - 1)} cy={geo.y(geo.closes.at(-1)!)} r={4} fill={tone} />
              )}
            </Svg>
            <View style={StyleSheet.absoluteFill} {...touch} />
          </>
        ) : (
          <ActivityIndicator color={colors.cyan} style={{ marginTop: H / 2 - 12 }} />
        )}
      </View>

      <Row style={{ justifyContent: 'space-between', marginTop: space(3) }}>
        <Row gap={6}>
          {RANGES.map((r) => (
            <Pressable key={r.label} onPress={() => setRange(r)} style={[st.range, r.label === range.label && st.rangeOn]}>
              <T v="small" color={r.label === range.label ? colors.text : colors.textDim} style={{ fontFamily: 'Inter_600SemiBold' }}>
                {r.label}
              </T>
            </Pressable>
          ))}
        </Row>
        <T v="small" color={colors.textMute}>
          Execution by Definitive Flash
        </T>
      </Row>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: space(5), borderWidth: 1, borderColor: '#2E2A5C' },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabOn: { backgroundColor: '#FFFFFF10', borderColor: '#FFFFFF22' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  range: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm },
  rangeOn: { backgroundColor: '#FFFFFF14' },
});
