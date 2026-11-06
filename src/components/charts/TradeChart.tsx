// Candlestick chart for building and reading playbooks:
//   • one finger: pan through time · two fingers: pinch to zoom · hold: crosshair with the candle's OHLC
//   • drag the Buy / TP / SL tags on the right to set each level on its own
//   • green / red zones show the reward and the risk from the buy level
// Drawn with react-native-svg and React Native touch responders (no native chart library). For smooth
// gestures, candles are four SVG paths, touch moves are batched to one update per frame, the price scale
// is locked while a level is dragged, and a dragged level moves locally until the finger lifts.
import * as Haptics from 'expo-haptics';
import { Maximize2, Minus, Plus } from 'lucide-react-native';
import { memo, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import type { Candle, Timeframe } from '@/lib/api';
import { clamp, fmtPrice, fmtTime, niceTicks } from '@/lib/chartMath';
import { Row } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, fonts, radius, space } from '@/ui/theme';

export type LevelKey = 'entry' | 'tp' | 'sl';
export type Level = { key: LevelKey; price: number; label: string; color: string; draggable?: boolean };

const TFS: { tf: Timeframe; label: string }[] = [
  { tf: '15m', label: '15m' },
  { tf: '1h', label: '1H' },
  { tf: '6h', label: '6H' },
  { tf: '1d', label: '1D' },
];
const AXIS_W = 60;
const TIME_H = 20;
const TAG_W = 108;
const FUTURE = 8; // empty candle slots on the right, where the zones are drawn
const MIN_VISIBLE = 16;
const DEFAULT_VISIBLE = 64;
const MONO = fonts.mono;

type Win = { end: number; count: number };
type Scale = { lo: number; hi: number };
type Geo = { start: number; step: number; first: number; last: number; x: (i: number) => number; y: (p: number) => number; p: (y: number) => number };

/** Candles as four paths (up/down wicks and bodies): a few SVG nodes however many candles are visible. */
const CandleLayer = memo(function CandleLayer({ data, geo }: { data: Candle[]; geo: Geo }) {
  let upW = '';
  let dnW = '';
  let upB = '';
  let dnB = '';
  const bw = Math.max(1, geo.step * 0.62);
  for (let i = geo.first; i <= geo.last; i++) {
    const c = data[i];
    const cx = geo.x(i);
    const top = geo.y(Math.max(c.o, c.c));
    const h = Math.max(1, geo.y(Math.min(c.o, c.c)) - top);
    const wick = `M${cx.toFixed(1)} ${geo.y(c.h).toFixed(1)}V${geo.y(c.l).toFixed(1)}`;
    const body = `M${(cx - bw / 2).toFixed(1)} ${top.toFixed(1)}h${bw.toFixed(1)}v${h.toFixed(1)}h${(-bw).toFixed(1)}Z`;
    if (c.c >= c.o) {
      upW += wick;
      upB += body;
    } else {
      dnW += wick;
      dnB += body;
    }
  }
  return (
    <G>
      <Path d={upW} stroke={colors.profit} strokeWidth={1} />
      <Path d={dnW} stroke={colors.loss} strokeWidth={1} />
      <Path d={upB} fill={colors.profit} />
      <Path d={dnB} fill={colors.loss} />
    </G>
  );
});

export function TradeChart({
  candles,
  tf,
  onTf,
  now,
  levels,
  onDrag,
  height = 300,
}: {
  candles: Candle[] | null;
  tf: Timeframe;
  onTf: (tf: Timeframe) => void;
  /** Live price; also moves the last candle's close. */
  now: number | null;
  levels: Level[];
  /** Called when a dragged level is released, with its new price. */
  onDrag?: (key: LevelKey, price: number) => void;
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const [win, setWin] = useState<Win | null>(null);
  const [cross, setCross] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ key: LevelKey; price: number; scale: Scale } | null>(null);

  const data = useMemo(() => {
    if (!candles?.length) return null;
    if (!now) return candles;
    const last = candles[candles.length - 1];
    return [...candles.slice(0, -1), { ...last, c: now, h: Math.max(last.h, now), l: Math.min(last.l, now) }];
  }, [candles, now]);

  const n = data?.length ?? 0;
  const maxEnd = n + FUTURE;
  const v: Win = win ?? { end: maxEnd, count: Math.min(DEFAULT_VISIBLE, n + FUTURE) };
  const plotW = Math.max(1, width - AXIS_W);
  const plotH = height - TIME_H;

  // Price scale: fitted to visible candles and levels, but frozen while a level is being dragged.
  const scale = useMemo<Scale | null>(() => {
    if (!data) return null;
    const start = v.end - v.count;
    const vis = data.slice(Math.max(0, Math.floor(start)), Math.min(n, Math.ceil(v.end) + 1));
    const prices = [...vis.flatMap((c) => [c.h, c.l]), ...levels.map((l) => l.price), ...(now ? [now] : [])];
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const pad = (hi - lo) * 0.08 || hi * 0.01;
    return { lo: lo - pad, hi: hi + pad };
  }, [data, n, v.end, v.count, levels, now]);
  const sc = drag?.scale ?? scale;

  const geo = useMemo<Geo | null>(() => {
    if (!data || !width || !sc) return null;
    const start = v.end - v.count;
    const step = plotW / v.count;
    const { lo, hi } = sc;
    return {
      start,
      step,
      first: Math.max(0, Math.floor(start)),
      last: Math.min(n - 1, Math.ceil(v.end)),
      x: (i: number) => (i - start + 0.5) * step,
      y: (p: number) => 8 + ((hi - p) / (hi - lo)) * (plotH - 16),
      p: (py: number) => hi - ((py - 8) / (plotH - 16)) * (hi - lo),
    };
  }, [data, width, sc, v.end, v.count, plotW, plotH, n]);

  const ticks = useMemo(() => (sc ? niceTicks(sc.lo, sc.hi, 5) : []), [sc]);
  const shown = drag ? levels.map((l) => (l.key === drag.key ? { ...l, price: drag.price } : l)) : levels;

  // ---- Gestures: responder props on an overlay; state that only touch events change lives in a ref ----
  const gest = useRef({
    mode: null as 'pan' | 'pinch' | 'drag' | 'cross' | null,
    start: { pageX: 0, end: 0, count: 0, dist: 0, mid: 0 },
    hold: null as ReturnType<typeof setTimeout> | null,
    frame: 0,
    pending: null as null | { x: number; y: number; pageX: number; t: { x: number; y: number }[] },
    dragKey: null as LevelKey | null,
    dragPrice: 0,
  });

  const fit = (end: number, count: number): Win => {
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
    // Grabbing a level's tag (right side, near its line) drags that level only.
    if (geo && sc && onDrag && x > plotW - TAG_W) {
      const hit = levels
        .filter((l) => l.draggable)
        .map((l) => ({ l, d: Math.abs(geo.y(l.price) - y) }))
        .sort((a, b) => a.d - b.d)[0];
      if (hit && hit.d < 26) {
        s.mode = 'drag';
        s.dragKey = hit.l.key;
        s.dragPrice = hit.l.price;
        setDrag({ key: hit.l.key, price: hit.l.price, scale: sc });
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

  /** Applies the latest touch position once per frame. */
  const flush = () => {
    const s = gest.current;
    s.frame = 0;
    const m = s.pending;
    if (!m || !geo) return;
    if (m.t.length >= 2 && s.mode !== 'drag') {
      clearHold();
      const dist = Math.hypot(m.t[0].x - m.t[1].x, m.t[0].y - m.t[1].y);
      const mid = (m.t[0].x + m.t[1].x) / 2;
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
      setWin(fit(anchor - (mid / plotW) * count + count, count));
      return;
    }
    if (s.mode === 'drag' && s.dragKey && drag) {
      s.dragPrice = geo.p(clamp(m.y, 8, plotH - 8));
      setDrag({ ...drag, price: s.dragPrice });
      return;
    }
    if (s.mode === 'cross') {
      setCross({ x: m.x, y: m.y });
      return;
    }
    const dx = m.pageX - s.start.pageX;
    if (s.mode === null && Math.abs(dx) > 6) {
      clearHold();
      s.mode = 'pan';
    }
    if (s.mode === 'pan') setWin(fit(s.start.end - dx / geo.step, s.start.count));
  };

  const onMove = (e: GestureResponderEvent) => {
    const s = gest.current;
    const ne = e.nativeEvent;
    s.pending = {
      x: ne.locationX,
      y: ne.locationY,
      pageX: ne.pageX,
      t: ne.touches.map((t) => ({ x: t.locationX, y: t.locationY })),
    };
    if (!s.frame) s.frame = requestAnimationFrame(flush);
  };

  const onEnd = () => {
    const s = gest.current;
    clearHold();
    if (s.frame) cancelAnimationFrame(s.frame);
    s.frame = 0;
    if (s.mode === 'drag' && s.dragKey && onDrag) onDrag(s.dragKey, s.dragPrice);
    s.mode = null;
    s.dragKey = null;
    s.pending = null;
    setDrag(null);
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
    const count = clamp(v.count * f, Math.min(MIN_VISIBLE, n), n + FUTURE);
    setWin({ count, end: clamp(v.end, Math.min(count, maxEnd), maxEnd) });
  };

  const hoverIdx = cross && geo ? clamp(Math.floor(geo.start + cross.x / geo.step), 0, n - 1) : null;
  const hc = hoverIdx !== null && data ? data[hoverIdx] : null;
  const entry = shown.find((l) => l.key === 'entry');
  const tp = shown.find((l) => l.key === 'tp');
  const sl = shown.find((l) => l.key === 'sl');
  const zoneX = geo ? Math.max(0, geo.x(n - 1) + geo.step / 2) : 0;

  return (
    <View>
      <Row style={{ justifyContent: 'space-between', marginBottom: space(3) }}>
        <View style={st.seg}>
          {TFS.map((o) => (
            <Pressable
              key={o.tf}
              onPress={() => {
                onTf(o.tf);
                setWin(null);
              }}
              style={[st.segItem, o.tf === tf && st.segOn]}>
              <T v="small" color={o.tf === tf ? colors.text : colors.textDim} style={{ fontFamily: fonts.bodyMed }}>
                {o.label}
              </T>
            </Pressable>
          ))}
        </View>
        <Row gap={6}>
          <Pressable onPress={() => zoom(1.4)} style={st.icon} hitSlop={6} accessibilityLabel="Zoom out">
            <Minus size={16} strokeWidth={1.75} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => zoom(1 / 1.4)} style={st.icon} hitSlop={6} accessibilityLabel="Zoom in">
            <Plus size={16} strokeWidth={1.75} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => setWin(null)} style={st.icon} hitSlop={6} accessibilityLabel="Reset zoom">
            <Maximize2 size={14} strokeWidth={1.75} color={colors.text} />
          </Pressable>
        </Row>
      </Row>

      <View style={[st.frame, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {geo && data ? (
          <>
            <Svg width={width} height={height}>
              {ticks.map((tick) => (
                <G key={tick}>
                  <Line x1={0} x2={plotW} y1={geo.y(tick)} y2={geo.y(tick)} stroke={colors.border} strokeWidth={1} />
                  <SvgText x={plotW + 6} y={geo.y(tick) + 4} fill={colors.textMute} fontSize={10} fontFamily={MONO}>
                    {fmtPrice(tick)}
                  </SvgText>
                </G>
              ))}

              {entry && tp ? (
                <Rect x={zoneX} width={Math.max(0, plotW - zoneX)} y={geo.y(tp.price)} height={Math.max(0, geo.y(entry.price) - geo.y(tp.price))} fill={colors.profit} opacity={0.1} />
              ) : null}
              {entry && sl ? (
                <Rect x={zoneX} width={Math.max(0, plotW - zoneX)} y={geo.y(entry.price)} height={Math.max(0, geo.y(sl.price) - geo.y(entry.price))} fill={colors.loss} opacity={0.1} />
              ) : null}

              <CandleLayer data={data} geo={geo} />

              {now ? (
                <G>
                  <Line x1={0} x2={plotW} y1={geo.y(now)} y2={geo.y(now)} stroke={colors.textMute} strokeDasharray="2 3" />
                  <Rect x={plotW + 2} y={geo.y(now) - 9} width={AXIS_W - 4} height={18} rx={4} fill={colors.ink} />
                  <SvgText x={plotW + 7} y={geo.y(now) + 4} fill={colors.onInk} fontSize={10} fontFamily={MONO}>
                    {fmtPrice(now)}
                  </SvgText>
                </G>
              ) : null}

              {shown.map((l) => {
                const ly = geo.y(l.price);
                const active = drag?.key === l.key;
                return (
                  <G key={l.key}>
                    <Line x1={0} x2={plotW} y1={ly} y2={ly} stroke={l.color} strokeWidth={active ? 2 : 1.25} strokeDasharray={l.draggable ? undefined : '5 4'} />
                    <Rect x={plotW - TAG_W} y={ly - 11} width={TAG_W - 4} height={22} rx={6} fill={l.color} />
                    <SvgText x={plotW - TAG_W + 8} y={ly + 4} fill={l.color === colors.accent ? colors.ink : colors.onInk} fontSize={10.5} fontFamily={MONO}>
                      {active ? `${l.label.split(' ')[0]} ${fmtPrice(l.price)}` : l.label}
                    </SvgText>
                  </G>
                );
              })}

              {[0.15, 0.5, 0.85].map((f) => {
                const i = clamp(Math.round(geo.start + f * v.count), 0, n - 1);
                return (
                  <SvgText key={f} x={geo.x(i)} y={height - 6} fill={colors.textMute} fontSize={10} fontFamily={MONO} textAnchor="middle">
                    {fmtTime(data[i].t, tf)}
                  </SvgText>
                );
              })}

              {cross && hc ? (
                <G>
                  <Line x1={geo.x(hoverIdx!)} x2={geo.x(hoverIdx!)} y1={0} y2={plotH} stroke={colors.textDim} strokeDasharray="3 3" />
                  <Line x1={0} x2={plotW} y1={cross.y} y2={cross.y} stroke={colors.textDim} strokeDasharray="3 3" />
                  <Rect x={plotW + 2} y={cross.y - 9} width={AXIS_W - 4} height={18} rx={4} fill={colors.cardHi} />
                  <SvgText x={plotW + 7} y={cross.y + 4} fill={colors.text} fontSize={10} fontFamily={MONO}>
                    {fmtPrice(geo.p(cross.y))}
                  </SvgText>
                </G>
              ) : null}
            </Svg>
            <View style={StyleSheet.absoluteFill} {...touch} />
            {hc ? (
              <View style={st.readout} pointerEvents="none">
                <T v="mono" color={colors.text}>
                  {fmtTime(hc.t, tf)}
                </T>
                <T v="mono">
                  O {fmtPrice(hc.o)} H {fmtPrice(hc.h)} L {fmtPrice(hc.l)} C{' '}
                  <T v="mono" color={hc.c >= hc.o ? colors.profit : colors.loss}>
                    {fmtPrice(hc.c)}
                  </T>
                </T>
              </View>
            ) : null}
          </>
        ) : (
          <ActivityIndicator color={colors.textDim} style={{ marginTop: height / 2 - 12 }} />
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  frame: {
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  seg: { flexDirection: 'row', padding: 3, borderRadius: radius.sm, backgroundColor: colors.cardHi },
  segItem: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm - 3 },
  segOn: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  icon: {
    width: 32,
    height: 30,
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
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
