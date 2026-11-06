// Swap tokens on Base through Uniswap (Uniswap API → v2 / v3 / v4 pools). Type on either side: what you pay
// (exact input) or what you want to get (exact output, e.g. "Get USDC" from the apply flow opens this with
// the missing USDC filled in). The quote refreshes while you look at it; the wallet sheet shows the swap
// before your fingerprint / PIN.
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowDownUp, Check, ExternalLink } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { Easing, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { formatUnits } from 'viem';

import { useFetch } from '@/hooks/useFetch';
import { api, type SwapSymbol, type UniswapQuote } from '@/lib/api';
import { txUrl } from '@/lib/constants';
import { shortAddr, usd } from '@/lib/pricing';
import { runSwap, SWAP_DECIMALS, swapAmount, type SwapStatus } from '@/lib/swapFlow';
import { maxEthSendable, toUnits, unitBalances } from '@/lib/transfers';
import { Button, Card, Header, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, DUR, EASE, fonts, radius, space } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

const SYMBOLS: SwapSymbol[] = ['ETH', 'USDC', 'WETH'];
const asSymbol = (v: unknown, d: SwapSymbol): SwapSymbol => (SYMBOLS.includes(v as SwapSymbol) ? (v as SwapSymbol) : d);
const STATUS: Record<SwapStatus, string> = {
  approve: 'Allowing Permit2 (first time only)',
  permit: 'Waiting for your signature',
  build: 'Preparing the swap',
  confirm: 'Waiting for your confirmation',
  pending: 'Swapping on Base',
};
// Keep some ETH for network fees when paying with ETH.
const ETH_FEE_RESERVE = 30_000_000_000_000n; // 0.00003 ETH

export default function Swap() {
  const params = useLocalSearchParams<{ pay?: string; get?: string; want?: string }>();
  const w = useWallet();
  const owner = w.address;
  const [pay, setPay] = useState<SwapSymbol>(asSymbol(params.pay, 'ETH'));
  const [get, setGet] = useState<SwapSymbol>(asSymbol(params.get, pay === 'USDC' ? 'ETH' : 'USDC'));
  // Which side the typed amount is on: 'in' = exact amount paid, 'out' = exact amount received.
  const [side, setSide] = useState<'in' | 'out'>(params.want ? 'out' : 'in');
  const [amount, setAmount] = useState(params.want ?? '');
  const [quote, setQuote] = useState<UniswapQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ hash: string; text: string } | null>(null);
  const [tick, setTick] = useState(0);

  const bal = useFetch(() => (owner ? unitBalances('base', owner) : Promise.resolve(null)), [owner], 20_000);
  const typedSymbol = side === 'in' ? pay : get;
  const units = toUnits(amount, SWAP_DECIMALS[typedSymbol]);
  const request = owner && units && units > 0n ? { swapper: owner, tokenIn: pay, tokenOut: get, type: side === 'in' ? 'EXACT_INPUT' : 'EXACT_OUTPUT', amount: units.toString() } as const : null;
  const requestKey = request ? JSON.stringify(request) : '';

  // Quote after typing stops, then refresh every 20 s (the API wants quotes under 30 s old).
  useEffect(() => {
    if (!requestKey || busy) return;
    let alive = true;
    const t = setTimeout(async () => {
      setQuoting(true);
      try {
        const q = await api.uniswapQuote(JSON.parse(requestKey));
        if (alive) {
          setQuote(q);
          setQuoteError(null);
        }
      } catch (e) {
        if (alive) {
          setQuote(null);
          setQuoteError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (alive) setQuoting(false);
      }
    }, 500);
    const refresh = setTimeout(() => setTick((n) => n + 1), 20_000);
    return () => {
      alive = false;
      clearTimeout(t);
      clearTimeout(refresh);
    };
  }, [requestKey, busy, tick]);

  const q = quote && requestKey && quote.summary.tokenIn === pay && quote.summary.tokenOut === get ? quote : null;
  const payBalance = bal.data?.[pay] ?? null;
  const payUnits = q ? BigInt(q.summary.amountIn) : side === 'in' ? units : null;
  const short = payUnits !== null && payBalance !== null && payUnits + (pay === 'ETH' ? ETH_FEE_RESERVE : 0n) > payBalance;
  const canSwap = !!owner && !!q && !short && !busy && !quoting;

  const shown = (s: 'in' | 'out') => {
    if (s === side) return amount;
    if (!q) return '';
    return swapAmount(s === 'in' ? q.summary.amountIn : q.summary.amountOut, s === 'in' ? pay : get);
  };
  const type = (s: 'in' | 'out', v: string) => {
    setSide(s);
    setAmount(v.replace(',', '.').replace(/[^0-9.]/g, ''));
    setQuote(null);
  };
  const flip = () => {
    Haptics.selectionAsync().catch(() => {});
    setPay(get);
    setGet(pay);
    setSide(side === 'in' ? 'out' : 'in');
    setQuote(null);
  };
  const pick = (s: 'in' | 'out', sym: SwapSymbol) => {
    Haptics.selectionAsync().catch(() => {});
    const other = s === 'in' ? get : pay;
    if (sym === other) return flip();
    if (s === 'in') setPay(sym);
    else setGet(sym);
    setQuote(null);
  };
  const max = async () => {
    if (payBalance === null || !owner) return;
    const m = pay === 'ETH' ? await maxEthSendable(owner, payBalance) : payBalance;
    type('in', m > 0n ? formatUnits(m, SWAP_DECIMALS[pay]) : '0');
  };

  const swap = async () => {
    if (!canSwap || !q || !request) return;
    setError(null);
    const text = `${swapAmount(q.summary.amountIn, pay)} ${pay} for ${swapAmount(q.summary.amountOut, get)} ${get}`;
    try {
      const hash = await runSwap(w, q, () => api.uniswapQuote(request), (s) => setBusy(STATUS[s]));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDone({ hash, text });
      bal.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const ease = useMemo(() => Easing.bezier(...EASE), []);

  if (done) {
    return (
      <Screen>
        <Header title="Swap" onBack={() => router.back()} />
        <Animated.View entering={FadeInDown.duration(DUR.enter).easing(ease)} style={st.ticket}>
          <View style={st.ticketHead}>
            <Animated.View entering={ZoomIn.duration(DUR.enter).easing(ease)} style={st.okDot}>
              <Check size={22} strokeWidth={2.5} color={colors.ink} />
            </Animated.View>
          </View>
          <View style={{ padding: space(5), gap: space(2), alignItems: 'center' }}>
            <T v="h2">Swapped</T>
            <T v="body" style={{ textAlign: 'center' }}>
              {done.text} on Base, through Uniswap
            </T>
            <Pressable onPress={() => Linking.openURL(txUrl(done.hash, 'base'))} style={st.link}>
              <T v="mono" color={colors.text}>
                {shortAddr(done.hash)}
              </T>
              <ExternalLink size={13} strokeWidth={1.75} color={colors.text} />
            </Pressable>
          </View>
        </Animated.View>
        <Button title="Done" onPress={() => router.back()} style={{ marginTop: space(5) }} />
      </Screen>
    );
  }

  const sideCard = (s: 'in' | 'out') => {
    const sym = s === 'in' ? pay : get;
    const b = bal.data?.[sym];
    return (
      <Card style={{ gap: space(2) }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="small">{s === 'in' ? 'You pay' : 'You get'}</T>
          <T v="mono">Balance {b === undefined ? '…' : swapAmount(b, sym)}</T>
        </Row>
        <Row gap={8}>
          <TextInput
            value={shown(s)}
            onChangeText={(v) => type(s, v)}
            placeholder="0"
            placeholderTextColor={colors.textMute}
            inputMode="decimal"
            style={[st.amount, s !== side && { color: colors.textDim }]}
            selectionColor={colors.ink}
            accessibilityLabel={s === 'in' ? `Amount of ${sym} to pay` : `Amount of ${sym} to get`}
          />
          {s === 'in' ? (
            <Pressable onPress={max} style={({ pressed }) => [st.max, pressed && { opacity: 0.7 }]} accessibilityLabel="Use the maximum">
              <T v="small" color={colors.ink} style={{ fontFamily: fonts.bodySemi }}>
                Max
              </T>
            </Pressable>
          ) : null}
        </Row>
        <Row gap={6}>
          {SYMBOLS.map((x) => (
            <Pressable key={x} onPress={() => pick(s, x)} style={[st.chip, x === sym && st.chipOn]} accessibilityLabel={`${s === 'in' ? 'Pay' : 'Get'} ${x}`}>
              <T v="small" color={colors.ink} style={{ fontFamily: x === sym ? fonts.bodySemi : fonts.body }}>
                {x}
              </T>
            </Pressable>
          ))}
        </Row>
      </Card>
    );
  };

  return (
    <Screen>
      <Header title="Swap" onBack={() => router.back()} />
      <T v="mono" style={{ marginTop: -space(3), marginBottom: space(4) }}>
        Base · routed through Uniswap v2, v3 and v4 pools
      </T>

      {sideCard('in')}
      <View style={{ alignItems: 'center', marginVertical: -space(3), zIndex: 1 }}>
        <Pressable onPress={flip} style={({ pressed }) => [st.flip, { transform: [{ scale: pressed ? 0.92 : 1 }] }]} accessibilityLabel="Swap direction">
          <ArrowDownUp size={18} strokeWidth={1.75} color={colors.ink} />
        </Pressable>
      </View>
      {sideCard('out')}

      <Card style={{ marginTop: space(3), gap: space(2) }}>
        {quoting && !q ? (
          <Row gap={8}>
            <ActivityIndicator size="small" color={colors.textDim} />
            <T v="small">Getting the best Uniswap route…</T>
          </Row>
        ) : q ? (
          <>
            {[
              { k: 'Rate', v: rate(q) },
              { k: 'At least', v: `${swapAmount(q.summary.minOut, get)} ${get} (0.5% slippage)` },
              { k: 'Price impact', v: q.summary.priceImpact === null ? '—' : `${q.summary.priceImpact.toFixed(2)}%` },
              { k: 'Network fee', v: q.summary.gasFeeUsd === null ? '—' : q.summary.gasFeeUsd < 0.01 ? 'under $0.01' : `≈ ${usd(q.summary.gasFeeUsd)}` },
              ...(q.summary.route ? [{ k: 'Route', v: q.summary.route }] : []),
              ...(q.approval ? [{ k: 'First time', v: `Allow ${pay} for Permit2 (one extra transaction)` }] : []),
            ].map((x) => (
              <Row key={x.k} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={12}>
                <T v="small">{x.k}</T>
                <T v="small" color={colors.text} style={{ flex: 1, textAlign: 'right' }} numberOfLines={2}>
                  {x.v}
                </T>
              </Row>
            ))}
          </>
        ) : (
          <T v="small" color={quoteError ? colors.loss : colors.textDim}>
            {quoteError ?? 'Enter an amount to see the Uniswap quote.'}
          </T>
        )}
      </Card>

      {short ? (
        <T v="small" color={colors.loss} style={{ marginTop: space(3) }}>
          {pay === 'ETH' ? 'Not enough ETH (keep a little for the network fee).' : `Not enough ${pay} in this wallet.`}
        </T>
      ) : null}
      {error ? (
        <T v="small" color={colors.loss} style={{ marginTop: space(3) }}>
          {error}
        </T>
      ) : null}
      <Button title={busy ?? 'Review swap'} loading={!!busy && !busy.startsWith('Waiting')} disabled={!canSwap} onPress={swap} style={{ marginTop: space(5) }} />
      <T v="mono" style={{ textAlign: 'center', marginTop: space(2) }}>
        You review it, then confirm with your fingerprint or PIN
      </T>
    </Screen>
  );
}

function rate(q: UniswapQuote) {
  const s = q.summary;
  const inN = Number(formatUnits(BigInt(s.amountIn), SWAP_DECIMALS[s.tokenIn]));
  const outN = Number(formatUnits(BigInt(s.amountOut), SWAP_DECIMALS[s.tokenOut]));
  if (!inN || !outN) return '—';
  // Show the price of the ETH-like side in USDC when USDC is involved, else 1:1-ish ratio.
  if (s.tokenIn === 'USDC') return `1 ${s.tokenOut} = ${usd(inN / outN)}`;
  if (s.tokenOut === 'USDC') return `1 ${s.tokenIn} = ${usd(outN / inN)}`;
  return `1 ${s.tokenIn} = ${(outN / inN).toFixed(4)} ${s.tokenOut}`;
}

const st = StyleSheet.create({
  amount: { flex: 1, color: colors.text, fontFamily: fonts.display, fontSize: 30, paddingVertical: 4 },
  max: { paddingHorizontal: space(3), height: 32, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.accent, borderWidth: 1.25, borderColor: colors.ink },
  chip: { paddingHorizontal: space(3), height: 30, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.borderHi },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.ink, borderWidth: 1.25 },
  flip: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1.25, borderColor: colors.ink },
  link: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: space(2) },
  ticket: { borderRadius: radius.xl, borderWidth: 1.25, borderColor: colors.ink, backgroundColor: colors.card, overflow: 'hidden' },
  ticketHead: { backgroundColor: colors.accent, alignItems: 'center', paddingVertical: space(5), borderBottomWidth: 1.25, borderBottomColor: colors.ink },
  okDot: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
});
