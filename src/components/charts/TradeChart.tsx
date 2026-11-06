// Candlestick chart for building and reading playbooks, TradingView-style:
//   • one finger: pan through time · two fingers: pinch to zoom · hold: crosshair with the candle's OHLC
//   • drag the Entry / Take profit / Stop tags on the right to set the rules straight from the chart
//   • green / red zones show the reward and the risk from the entry
// Drawn with react-native-svg and React Native touch responders only (no native chart library).
import * as Haptics from 'expo-haptics';
import { Maximize2, Minus, Plus } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

import type { Candle, Timeframe } from '@/lib/api';
import { clamp, fmtPrice, fmtTime, niceTicks } from '@/lib/chartMath';
import { Row } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, radius, space } from '@/ui/theme';

export type LevelKey = 'entry' | 'tp' | 'sl';
export type Level = { key: LevelKey; price: number; label: string; color: string; draggable?: boolean };

const TFS: { tf: Timeframe; label: string }[] = [
  { tf: '15m', label: '15m' },
  { tf: '1h', label: '1H' },
  { tf: '6h', label: '6H' },
  { tf: '1d', label: '1D' },
];
const AXIS_W = 58;
const TIME_H = 20;
const TAG_W = 112;
const FUTURE = 8; // empty candle slots on the right, where the zones are drawn
const MIN_VISIBLE = 16;
const DEFAULT_VISIBLE = 70;
const UP = colors.profit;
const DOWN = colors.loss;

type View_ = { end: number; count: number };

export function TradeChart({
  candles,
  tf,
  onTf,
  now,
  levels,
  onDrag,
  height = 330,
}: {
  candles: Candle[] | null;
  tf: Timeframe;
  onTf: (tf: Timeframe) => void;
  /** Live price; also moves the last candle's close. */
  now: number | null;
  levels: Level[];
  /** Called while a draggable level is dragged, with the price under the finger. */
  onDrag?: (key: LevelKey, price: number) => void;
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const [view, setView] = useState<View_ | null>(null);
  const [cross, setCross] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<LevelKey | null>(null);

  const data = useMemo(() => {
    if (!candles?.length) return null;
    if (!now) return candles;
    const last = candles[candles.length - 1];
    return [...candles.slice(0, -1), { ...last, c: now, h: Math.max(last.h, now), l: Math.min(last.l, now) }];
  }, [candles, now]);

  const n = data?.length ?? 0;
  const maxEnd = n + FUTURE;
  const v: View_ = view ?? { end: maxEnd, count: Math.min(DEFAULT_VISIBLE, n + FUTURE) };
  const plotW = Math.max(1, width - AXIS_W);
  const plotH = height - TIME_H;

  const geo = useMemo(() => {
    if (!data || !width) return null;
    const start = v.end - v.count;
    const step = plotW / v.count;
    const first = Math.max(0, Math.floor(start));
    const last = Math.min(n - 1, Math.ceil(v.end));
    const vis = data.slice(first, last + 1);
    const prices = [...vis.flatMap((c) => [c.h, c.l]), ...levels.map((l) => l.price), ...(now ? [now] : [])];
    let lo = Math.min(...prices);
    let hi = Math.max(...prices);
    const pad = (hi - lo) * 0.08 || hi * 0.01;
    lo -= pad;
    hi += pad;
    const x = (i: number) => (i - start + 0.5) * step;
    const y = (p: number) => 8 + ((hi - p) / (hi - lo)) * (plotH - 16);
    const p = (py: number) => hi - ((py - 8) / (plotH - 16)) * (hi - lo);
    return { start, step, first, last, x, y, p, ticks: niceTicks(lo, hi, 5) };
  }, [data, width, v.end, v.count, plotW, plotH, n, levels, now]);

  // Touch handling with React Native's responder props on an overlay. Gesture state lives in a ref that
  // only touch events change; the handlers are plain functions, so they always see the latest geometry.
  const gest = useRef({
    mode: null as 'pan' | 'pinch' | 'drag' | 'cross' | null,
    start: { pageX: 0, end: 0, count: 0, dist: 0, mid: 0 },
    hold: null as ReturnType<typeof setTimeout> | null,
    dragKey: null as LevelKey | null,
  });

  const fit = (end: number, count: number): View_ => {
    const c = clamp(count, Math.min(MIN_VISIBLE, n), n + FUTURE);
    return { count: c, end: clamp(end, Math.min(c, maxEnd), maxEnd) };
  };
  const clearHold = () => {
    const s = gest.current;
    if (s.hold) clearTimeout(s.hold);
    s.hold = null;
  };

  const onGrant = (e: GestureResponderEvent) => {
    const s = gest.current;
    const { locationX: x, locationY: y, pageX } = e.nativeEvent;
    s.mode = null;
    s.dragKey = null;
    s.start = { pageX, end: v.end, count: v.count, dist: 0, mid: 0 };
    // Grabbing a level's tag (right side, near its line) drags that level.
    if (geo && onDrag && x > plotW - TAG_W) {
      const hit = levels
        .filter((l) => l.draggable)
        .map((l) => ({ l, d: Math.abs(geo.y(l.price) - y) }))
        .sort((a, b) => a.d - b.d)[0];
      if (hit && hit.d < 26) {
        s.mode = 'drag';
        s.dragKey = hit.l.key;
        setDragging(hit.l.key);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        return;
      }
    }
    s.hold = setTimeout(() => {
      if (gest.current.mode === null) {
        gest.current.mode = 'cross';
        setCross({ x, y });
        Haptics.selectionAsync().catch(() => {});
      }
    }, 260);
  };

  const onMove = (e: GestureResponderEvent) => {
    const s = gest.current;
    const t = e.nativeEvent.touches;
    if (t.length >= 2 && s.mode !== 'drag') {
      clearHold();
      const dist = Math.hypot(t[0].locationX - t[1].locationX, t[0].locationY - t[1].locationY);
      const mid = (t[0].locationX + t[1].locationX) / 2;
      if (s.mode !== 'pinch') {
        s.mode = 'pinch';
        s.start = { ...s.start, end: v.end, count: v.count, dist, mid };
        setCross(null);
        return;
      }
      // Keep the candle under the fingers' midpoint under it while zooming and panning.
      const st0 = s.start;
      const count = st0.count * (st0.dist / Math.max(dist, 1));
      const anchor = st0.end - st0.count + (st0.mid / plotW) * st0.count;
      setView(fit(anchor - (mid / plotW) * count + count, count));
      return;
    }
    if (s.mode === 'drag' && s.dragKey && geo && onDrag) {
      onDrag(s.dragKey, geo.p(e.nativeEvent.locationY));
      return;
    }
    if (s.mode === 'cross') {
      setCross({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY });
      return;
    }
    const dx = e.nativeEvent.pageX - s.start.pageX;
    if (s.mode === null && Math.abs(dx) > 6) {
      clearHold();
      s.mode = 'pan';
    }
    if (s.mode === 'pan' && geo) setView(fit(s.start.end - dx / geo.step, s.start.count));
  };

  const onEnd = () => {
    clearHold();
    gest.current.mode = null;
    gest.current.dragKey = null;
    setDragging(null);
    setCross(null);
  };

  const touch = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: onGrant,
    onResponderMove: onMove,
    onResponderRelease: onEnd,
    onResponderTerminate: onEnd,
  };

  const zoom = (f: number) => {
    const cur = view ?? v;
    const count = clamp(cur.count * f, Math.min(MIN_VISIBLE, n), n + FUTURE);
    setView({ count, end: clamp(cur.end, Math.min(count, maxEnd), maxEnd) });
  };

  // Crosshair readout: the candle under the finger.
  const hoverIdx = cross && geo ? clamp(Math.floor(geo.start + cross.x / geo.step), 0, n - 1) : null;
  const hc = hoverIdx !== null && data ? data[hoverIdx] : null;

  const entry = levels.find((l) => l.key === 'entry');
  const tp = levels.find((l) => l.key === 'tp');
  const sl = levels.find((l) => l.key === 'sl');
  const zoneX = geo && data ? Math.max(0, geo.x(n - 1) + geo.step / 2) : 0;

  return (
    <View>
      <Row style={{ justifyContent: 'space-between', marginBottom: space(2) }}>
        <Row gap={4}>
          {TFS.map((o) => (
            <Pressable
              key={o.tf}
              onPress={() => {
                onTf(o.tf);
                setView(null);
              }}
              style={[st.chip, o.tf === tf && st.chipOn]}>
              <T v="small" color={o.tf === tf ? colors.text : colors.textDim} style={{ fontFamily: 'Inter_600SemiBold' }}>
                {o.label}
              </T>
            </Pressable>
          ))}
        </Row>
        <Row gap={4}>
          <Pressable onPress={() => zoom(1.4)} style={st.icon} hitSlop={6}>
            <Minus size={15} color={colors.textDim} />
          </Pressable>
          <Pressable onPress={() => zoom(1 / 1.4)} style={st.icon} hitSlop={6}>
            <Plus size={15} color={colors.textDim} />
          </Pressable>
          <Pressable onPress={() => setView(null)} style={st.icon} hitSlop={6}>
            <Maximize2 size={14} color={colors.textDim} />
          </Pressable>
        </Row>
      </Row>

      <View style={[st.frame, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {geo && data ? (
          <>
            <Svg width={width} height={height}>
              {geo.ticks.map((tick) => (
                <G key={tick}>
                  <Line x1={0} x2={plotW} y1={geo.y(tick)} y2={geo.y(tick)} stroke={colors.border} strokeWidth={1} />
                  <SvgText x={plotW + 6} y={geo.y(tick) + 4} fill={colors.textMute} fontSize={10}>
                    {fmtPrice(tick)}
                  </SvgText>
                </G>
              ))}

              {/* Reward and risk zones, from the latest candle into the future. */}
              {entry && tp ? (
                <Rect
                  x={zoneX}
                  width={Math.max(0, plotW - zoneX)}
                  y={geo.y(tp.price)}
                  height={Math.max(0, geo.y(entry.price) - geo.y(tp.price))}
                  fill={UP}
                  opacity={0.12}
                />
              ) : null}
              {entry && sl ? (
                <Rect
                  x={zoneX}
                  width={Math.max(0, plotW - zoneX)}
                  y={geo.y(entry.price)}
                  height={Math.max(0, geo.y(sl.price) - geo.y(entry.price))}
                  fill={DOWN}
                  opacity={0.12}
                />
              ) : null}

              {data.slice(geo.first, geo.last + 1).map((c, k) => {
                const i = geo.first + k;
                const cx = geo.x(i);
                const up = c.c >= c.o;
                const col = up ? UP : DOWN;
                const bw = Math.max(1, geo.step * 0.62);
                const top = geo.y(Math.max(c.o, c.c));
                return (
                  <G key={c.t}>
                    <Line x1={cx} x2={cx} y1={geo.y(c.h)} y2={geo.y(c.l)} stroke={col} strokeWidth={1} />
                    <Rect x={cx - bw / 2} y={top} width={bw} height={Math.max(1, geo.y(Math.min(c.o, c.c)) - top)} fill={col} />
                  </G>
                );
              })}

              {now ? (
                <G>
                  <Line x1={0} x2={plotW} y1={geo.y(now)} y2={geo.y(now)} stroke={colors.textDim} strokeDasharray="2 3" />
                  <Rect x={plotW + 1} y={geo.y(now) - 9} width={AXIS_W - 2} height={18} rx={4} fill={colors.text} />
                  <SvgText x={plotW + 6} y={geo.y(now) + 4} fill={colors.bg} fontSize={10} fontWeight="700">
                    {fmtPrice(now)}
                  </SvgText>
                </G>
              ) : null}

              {levels.map((l) => {
                const ly = geo.y(l.price);
                const active = dragging === l.key;
                return (
                  <G key={l.key}>
                    <Line x1={0} x2={plotW} y1={ly} y2={ly} stroke={l.color} strokeWidth={active ? 2 : 1.4} strokeDasharray={l.draggable ? undefined : '5 4'} />
                    <Rect x={plotW - TAG_W} y={ly - 11} width={TAG_W - 4} height={22} rx={6} fill={l.color} opacity={active ? 1 : 0.92} />
                    <SvgText x={plotW - TAG_W + 8} y={ly + 4} fill={colors.bg} fontSize={10.5} fontWeight="700">
                      {`${l.draggable ? '≡ ' : ''}${l.label}`}
                    </SvgText>
                  </G>
                );
              })}

              {[0.15, 0.5, 0.85].map((f) => {
                const i = clamp(Math.round(geo.start + f * v.count), 0, n - 1);
                return (
                  <SvgText key={f} x={geo.x(i)} y={height - 6} fill={colors.textMute} fontSize={10} textAnchor="middle">
                    {fmtTime(data[i].t, tf)}
                  </SvgText>
                );
              })}

              {cross && hc ? (
                <G>
                  <Line x1={geo.x(hoverIdx!)} x2={geo.x(hoverIdx!)} y1={0} y2={plotH} stroke={colors.textDim} strokeDasharray="3 3" />
                  <Line x1={0} x2={plotW} y1={cross.y} y2={cross.y} stroke={colors.textDim} strokeDasharray="3 3" />
                  <Rect x={plotW + 1} y={cross.y - 9} width={AXIS_W - 2} height={18} rx={4} fill={colors.cardHi} />
                  <SvgText x={plotW + 6} y={cross.y + 4} fill={colors.text} fontSize={10}>
                    {fmtPrice(geo.p(cross.y))}
                  </SvgText>
                </G>
              ) : null}
            </Svg>
            <View style={StyleSheet.absoluteFill} {...touch} />
            {hc ? (
              <View style={st.readout} pointerEvents="none">
                <T v="small" color={colors.text}>
                  {fmtTime(hc.t, tf)}
                </T>
                <T v="small">
                  O {fmtPrice(hc.o)} H {fmtPrice(hc.h)} L {fmtPrice(hc.l)} C{' '}
                  <T v="small" color={hc.c >= hc.o ? UP : DOWN}>
                    {fmtPrice(hc.c)}
                  </T>
                </T>
              </View>
            ) : null}
          </>
        ) : (
          <ActivityIndicator color={colors.cyan} style={{ marginTop: height / 2 - 12 }} />
        )}
      </View>
      <T v="small" color={colors.textMute} style={{ marginTop: space(2), textAlign: 'center' }}>
        {onDrag ? 'Drag the tags to set your rules · pinch to zoom · hold to inspect' : 'Pinch to zoom · drag to pan · hold to inspect'}
      </T>
    </View>
  );
}

const st = StyleSheet.create({
  frame: {
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm },
  chipOn: { backgroundColor: colors.cardHi, borderWidth: 1, borderColor: colors.borderHi },
  icon: {
    width: 30,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardHi,
  },
  readout: {
    position: 'absolute',
    left: 8,
    top: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#0B0E1AE6',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
