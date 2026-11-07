// Discover's market card: live ETH / SOL price as a smooth line chart read the way a trader reads one:
//   • dashed line = where the range opened; the line is green above it, red below it
//   • the range's high and low are marked on the line with their prices
//   • the live price pulses at the end of the line
//   • drag across to read any point (price, change from the open, time)
// The chart height comes from the screen (Discover fits the page to the phone), so nothing is left empty.
import * as Haptics from 'expo-haptics';
import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { NETWORK_DOT } from '@/components/NetworkSwitch';
import { useCandles } from '@/hooks/useCandles';
import { usePrice } from '@/hooks/usePrice';
import type { Timeframe } from '@/lib/api';
import { fmtTime } from '@/lib/chartMath';
import { CHAINS, NETWORKS, type Chain } from '@/lib/constants';
import { usd } from '@/lib/pricing';
import { Row, useScrollLock } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, fonts, radius, space } from '@/ui/theme';

const RANGES: { label: string; tf: Timeframe; n: number; since: string }[] = [
  { label: '1D', tf: '15m', n: 96, since: '24h' },
  { label: '1W', tf: '1h', n: 168, since: '7d' },
  { label: '1M', tf: '6h', n: 120, since: '30d' },
  { label: '1Y', tf: '1d', n: 350, since: '1y' },
];
const PAD_Y = 16; // room for the H / L labels above and below the line
const MONO = fonts.mono;

type Pt = { x: number; y: number };

/** Smooth path through the points (Catmull-Rom as cubic Béziers, control points kept inside the chart). */
function smooth(pts: Pt[], top: number, bottom: number) {
  if (pts.length < 2) return '';
  const clampY = (y: number) => Math.max(top, Math.min(bottom, y));
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: clampY(p1.y + (p2.y - p0.y) / 6) };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: clampY(p2.y - (p3.y - p1.y) / 6) };
    d += `C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

const short = (p: number) => (p >= 1000 ? usd(p, 0) : usd(p));

const Chart = memo(function Chart({ closes, width, height, hover }: { closes: number[]; width: number; height: number; hover: number | null }) {
  const geo = useMemo(() => {
    const lo = Math.min(...closes);
    const hi = Math.max(...closes);
    const span = hi - lo || hi * 0.01;
    // Right padding leaves room for the live-price dot and its glow.
    const x = (i: number) => 4 + (i / (closes.length - 1)) * (width - 18);
    const y = (p: number) => PAD_Y + ((hi - p) / span) * (height - PAD_Y * 2);
    const pts = closes.map((c, i) => ({ x: x(i), y: y(c) }));
    const line = smooth(pts, PAD_Y - 2, height - PAD_Y + 2);
    const base = y(closes[0]);
    const area = `${line}L${pts[pts.length - 1].x.toFixed(1)},${base.toFixed(1)}L${pts[0].x.toFixed(1)},${base.toFixed(1)}Z`;
    const hiI = closes.indexOf(hi);
    const loI = closes.indexOf(lo);
    return { x, y, line, area, base, hi, lo, hiI, loI };
  }, [closes, width, height]);

  const last = closes.length - 1;
  const at = hover ?? last;
  const tone = closes[at] >= closes[0] ? colors.profit : colors.loss;
  // Keep the H / L labels inside the card.
  const labelX = (i: number) => Math.max(0, Math.min(width - 64, geo.x(i) - 30));

  return (
    <Svg width={width} height={height}>
      <Defs>
        <ClipPath id="mk-above">
          <Rect x={0} y={0} width={width} height={geo.base} />
        </ClipPath>
        <ClipPath id="mk-below">
          <Rect x={0} y={geo.base} width={width} height={height - geo.base} />
        </ClipPath>
      </Defs>

      <Line x1={0} x2={width} y1={geo.base} y2={geo.base} stroke={colors.borderHi} strokeWidth={1} strokeDasharray="2 5" strokeLinecap="round" />

      <G clipPath="url(#mk-above)">
        <Path d={geo.area} fill={colors.profit} opacity={0.1} />
        <Path d={geo.line} stroke={colors.profit} strokeWidth={2.25} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </G>
      <G clipPath="url(#mk-below)">
        <Path d={geo.area} fill={colors.loss} opacity={0.1} />
        <Path d={geo.line} stroke={colors.loss} strokeWidth={2.25} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </G>

      {hover === null ? (
        <>
          <Circle cx={geo.x(geo.hiI)} cy={geo.y(geo.hi)} r={2.5} fill={colors.ink} />
          <SvgText x={labelX(geo.hiI)} y={geo.y(geo.hi) - 6} fill={colors.textDim} fontSize={9.5} fontFamily={MONO}>
            {`H ${short(geo.hi)}`}
          </SvgText>
          <Circle cx={geo.x(geo.loI)} cy={geo.y(geo.lo)} r={2.5} fill={colors.ink} />
          <SvgText x={labelX(geo.loI)} y={geo.y(geo.lo) + 13} fill={colors.textDim} fontSize={9.5} fontFamily={MONO}>
            {`L ${short(geo.lo)}`}
          </SvgText>
        </>
      ) : (
        <Line x1={geo.x(at)} x2={geo.x(at)} y1={4} y2={height - 4} stroke={colors.ink} strokeWidth={1} strokeDasharray="2 4" strokeLinecap="round" />
      )}

      <Circle cx={geo.x(at)} cy={geo.y(closes[at])} r={hover === null ? 9 : 10} fill={tone} opacity={0.18} />
      <Circle cx={geo.x(at)} cy={geo.y(closes[at])} r={4.5} fill={tone} stroke={colors.card} strokeWidth={2} />
    </Svg>
  );
});

export function MarketCard({ chartHeight = 120 }: { chartHeight?: number }) {
  const [chain, setChain] = useState<Chain>('base');
  const [range, setRange] = useState(RANGES[0]);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const live = usePrice(chain);
  const all = useCandles(chain, range.tf);

  // About one point per 4 px keeps the curve smooth without drawing hundreds of segments.
  const view = useMemo(() => {
    if (!all?.length || !width) return null;
    const data = all.slice(-range.n);
    const step = Math.max(1, Math.ceil(data.length / Math.max(24, Math.floor(width / 4))));
    const pick = data.filter((_, i) => i % step === 0 || i === data.length - 1);
    const closes = pick.map((d) => d.c);
    if (live) closes[closes.length - 1] = live.price;
    return { closes, times: pick.map((d) => d.t) };
  }, [all, range.n, live, width]);

  const lockScroll = useScrollLock();
  const pick = (x: number) => {
    if (!view) return;
    setHover(Math.max(0, Math.min(view.closes.length - 1, Math.round((x / width) * (view.closes.length - 1)))));
  };
  const release = () => {
    setHover(null);
    lockScroll(false);
  };
  const touch = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      Haptics.selectionAsync().catch(() => {});
      lockScroll(true);
      pick(e.nativeEvent.locationX);
      return true;
    },
    onResponderMove: (e: GestureResponderEvent) => pick(e.nativeEvent.locationX),
    onResponderRelease: release,
    onResponderTerminate: release,
  };

  const price = hover !== null && view ? view.closes[hover] : live?.price ?? view?.closes.at(-1) ?? null;
  const open = view?.closes[0];
  const change = open && price ? ((price - open) / open) * 100 : null;
  const up = (change ?? 0) >= 0;

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
              style={[st.segItem, c === chain && st.segOn]}
              accessibilityLabel={`Show ${NETWORKS[c].asset}`}>
              <View style={[st.dot, { backgroundColor: NETWORK_DOT[c] }]} />
              <T v="small" color={c === chain ? colors.text : colors.textDim} style={{ fontFamily: fonts.bodyMed }}>
                {NETWORKS[c].asset}
              </T>
            </Pressable>
          ))}
        </View>
        <Row gap={2}>
          {RANGES.map((r) => {
            const on = r.label === range.label;
            return (
              <Pressable
                key={r.label}
                onPress={() => {
                  setRange(r);
                  setHover(null);
                }}
                hitSlop={4}
                style={[st.range, on && st.rangeOn]}
                accessibilityLabel={`Range ${r.label}`}>
                <T v="mono" color={on ? colors.onInk : colors.textDim} style={{ fontSize: 11 }}>
                  {r.label}
                </T>
              </Pressable>
            );
          })}
        </Row>
      </Row>

      <Row style={{ marginTop: space(3), justifyContent: 'space-between', alignItems: 'center' }}>
        <T v="numLg" numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1 }}>
          {price ? usd(price) : '—'}
        </T>
        {change !== null ? (
          <View style={[st.change, { backgroundColor: up ? colors.profitSoft : colors.lossSoft }]}>
            <T v="mono" color={up ? colors.profit : colors.loss} style={{ fontFamily: fonts.monoMed }}>
              {up ? '▲' : '▼'} {Math.abs(change).toFixed(2)}% · {hover !== null && view ? fmtTime(view.times[hover], range.tf) : range.since}
            </T>
          </View>
        ) : null}
      </Row>

      <View style={{ height: chartHeight, marginTop: space(2), marginHorizontal: -4 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {view && view.closes.length > 1 ? (
          <>
            <Chart closes={view.closes} width={width} height={chartHeight} hover={hover} />
            <View style={StyleSheet.absoluteFill} {...touch} />
          </>
        ) : (
          <ActivityIndicator color={colors.textDim} style={{ marginTop: chartHeight / 2 - 10 }} />
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: radius.xl, padding: space(4), paddingBottom: space(3), borderWidth: 1.25, borderColor: colors.ink, backgroundColor: colors.card },
  seg: { flexDirection: 'row', padding: 3, gap: 2, borderRadius: radius.sm, backgroundColor: colors.cardHi },
  segItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm - 3 },
  segOn: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  dot: { width: 7, height: 7, borderRadius: 4 },
  range: { paddingHorizontal: 7, height: 26, justifyContent: 'center', borderRadius: radius.pill },
  rangeOn: { backgroundColor: colors.ink },
  change: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, marginLeft: space(2) },
});
