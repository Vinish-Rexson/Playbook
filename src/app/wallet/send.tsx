// Send (withdraw) from the built-in wallet: pick the network and token, paste an address, choose an amount.
// The confirmation sheet decodes the transaction on the phone, then a fingerprint / PIN check, then it is sent.
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, ClipboardPaste, ExternalLink, TriangleAlert } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { Easing, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { formatUnits } from 'viem';

import { NetworkSwitch } from '@/components/NetworkSwitch';
import { useFetch } from '@/hooks/useFetch';
import { usePrice } from '@/hooks/usePrice';
import { api } from '@/lib/api';
import { waitForTx } from '@/lib/chain';
import { NETWORKS, txUrl, type Chain } from '@/lib/constants';
import { shortAddr, usd } from '@/lib/pricing';
import {
  baseSendTx,
  buildSolanaSend,
  isRecipientValid,
  maxEthSendable,
  maxSolSendable,
  SEND_TOKENS,
  sendSolanaSigned,
  toUnits,
  unitBalances,
  type SendToken,
} from '@/lib/transfers';
import { Button, Card, Header, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, DUR, EASE, fonts, radius, space } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

const fmt = (units: bigint, decimals: number) => {
  const s = formatUnits(units, decimals);
  const [i, f = ''] = s.split('.');
  return f ? `${i}.${f.slice(0, decimals > 6 ? 6 : decimals)}`.replace(/\.?0+$/, '') : i;
};

type Done = { chain: Chain; tx: string; text: string };

export default function Send() {
  const params = useLocalSearchParams<{ chain?: string }>();
  const w = useWallet();
  const [chain, setChain] = useState<Chain>(params.chain === 'solana' ? 'solana' : 'base');
  const tokens = SEND_TOKENS[chain];
  const [symbol, setSymbol] = useState('USDC');
  const token: SendToken = tokens.find((t) => t.symbol === symbol) ?? tokens[0];
  const owner = chain === 'solana' ? w.solAddress : w.address;
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const price = usePrice(chain);

  const bal = useFetch(() => (owner ? unitBalances(chain, owner) : Promise.resolve(null)), [chain, owner], 20_000);
  const positions = useFetch(() => (owner ? api.positions([owner]) : Promise.resolve({ positions: [] })), [owner]);
  const openProtected = (positions.data?.positions ?? []).filter((p) => p.chain === chain && p.status === 'filled').length;

  const balance = bal.data?.[token.symbol] ?? null;
  const units = toUnits(amount, token.decimals);
  const toTrim = to.trim();
  const validTo = !!toTrim && isRecipientValid(chain, toTrim);
  const self = validTo && owner && (chain === 'solana' ? toTrim === owner : toTrim.toLowerCase() === owner.toLowerCase());
  const tooMuch = units !== null && balance !== null && units > balance;
  const usdValue = units === null ? null : Number(formatUnits(units, token.decimals)) * (token.symbol === 'USDC' ? 1 : price?.price ?? 0);
  const canSend = !!owner && validTo && !self && units !== null && !tooMuch && !busy;

  const switchChain = (c: Chain) => {
    setChain(c);
    setSymbol('USDC');
    setTo('');
    setAmount('');
    setError(null);
  };

  const max = async () => {
    if (balance === null || !owner) return;
    Haptics.selectionAsync().catch(() => {});
    let m = balance;
    if (!token.address) m = chain === 'solana' ? maxSolSendable(balance) : await maxEthSendable(owner, balance);
    setAmount(m > 0n ? formatUnits(m, token.decimals) : '0');
  };

  const paste = async () => {
    const s = (await Clipboard.getStringAsync()).trim();
    if (s) setTo(s);
  };

  const send = async () => {
    if (!canSend || !owner || units === null) return;
    setError(null);
    const text = `${fmt(units, token.decimals)} ${token.symbol} to ${shortAddr(toTrim)}`;
    try {
      if (chain === 'solana') {
        setBusy('Preparing');
        const { message } = await buildSolanaSend(owner, token, toTrim, units);
        setBusy('Waiting for your confirmation');
        const sig = await w.signSolanaTransaction(message, { recipient: toTrim, auth: 'Confirm this withdrawal' });
        setBusy('Sending on Solana');
        const tx = await sendSolanaSigned(message, sig);
        setDone({ chain, tx, text });
      } else {
        setBusy('Waiting for your confirmation');
        const hash = await w.sendTransaction(baseSendTx(token, toTrim, units), { auth: 'Confirm this withdrawal' });
        setBusy('Confirming on Base');
        const r = await waitForTx(hash);
        if (r.status !== 'success') throw new Error('The transfer failed on Base');
        setDone({ chain, tx: hash, text });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
        <Header title="Send" onBack={() => router.back()} />
        <Animated.View entering={FadeInDown.duration(DUR.enter).easing(ease)} style={st.ticket}>
          <View style={st.ticketHead}>
            <Animated.View entering={ZoomIn.duration(DUR.enter).easing(ease)} style={st.okDot}>
              <Check size={22} strokeWidth={2.5} color={colors.ink} />
            </Animated.View>
          </View>
          <View style={{ padding: space(5), gap: space(2), alignItems: 'center' }}>
            <T v="h2">Sent</T>
            <T v="body" style={{ textAlign: 'center' }}>
              {done.text} on {NETWORKS[done.chain].name}
            </T>
            <Pressable onPress={() => Linking.openURL(txUrl(done.tx, done.chain))} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: space(2) }}>
              <T v="mono" color={colors.text}>
                {shortAddr(done.tx)}
              </T>
              <ExternalLink size={13} strokeWidth={1.75} color={colors.text} />
            </Pressable>
          </View>
        </Animated.View>
        <Button title="Done" onPress={() => router.back()} style={{ marginTop: space(5) }} />
        <Button
          title="Send more"
          variant="ghost"
          onPress={() => {
            setDone(null);
            setAmount('');
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Send" onBack={() => router.back()} />
      <NetworkSwitch value={chain} onChange={switchChain} showAsset={false} disabled={w.solAddress ? [] : ['solana']} />

      <Row style={{ marginTop: space(5), justifyContent: 'space-between' }}>
        {tokens.map((t) => {
          const on = t.symbol === token.symbol;
          const b = bal.data?.[t.symbol];
          return (
            <Pressable
              key={t.symbol}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setSymbol(t.symbol);
                setAmount('');
              }}
              style={({ pressed }) => [st.token, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
              accessibilityLabel={`Send ${t.symbol}`}>
              <View style={[st.tokenCircle, on && st.tokenOn]}>
                <T v="h3" color={colors.ink}>
                  {t.symbol.replace(/^w/, '')[0]}
                </T>
                {on ? (
                  <View style={st.tick}>
                    <Check size={10} strokeWidth={3} color={colors.onInk} />
                  </View>
                ) : null}
              </View>
              <T v="small" color={colors.text} style={{ fontFamily: fonts.bodyMed }}>
                {t.symbol}
              </T>
              <T v="mono" style={{ fontSize: 11 }}>
                {b === undefined ? '…' : fmt(b, t.decimals)}
              </T>
            </Pressable>
          );
        })}
      </Row>

      <Card style={{ marginTop: space(5), gap: space(2) }}>
        <T v="small">To</T>
        <Row gap={8}>
          <TextInput
            value={to}
            onChangeText={setTo}
            placeholder={chain === 'solana' ? 'Solana address' : '0x… address on Base'}
            placeholderTextColor={colors.textMute}
            autoCapitalize="none"
            autoCorrect={false}
            style={st.addr}
            selectionColor={colors.ink}
            accessibilityLabel="Recipient address"
          />
          <Pressable onPress={paste} style={({ pressed }) => [st.paste, pressed && { opacity: 0.6 }]} accessibilityLabel="Paste address">
            <ClipboardPaste size={16} strokeWidth={1.75} color={colors.text} />
          </Pressable>
        </Row>
        {toTrim ? (
          <T v="mono" color={!validTo || self ? colors.loss : colors.profit} style={{ fontSize: 11 }}>
            {!validTo ? `Not a ${NETWORKS[chain].name} address` : self ? 'This is your own address' : `${NETWORKS[chain].name} address · ${shortAddr(toTrim)}`}
          </T>
        ) : null}
      </Card>

      <Card style={{ marginTop: space(3), gap: space(2) }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="small">Amount</T>
          <T v="mono">Available {balance === null ? '…' : `${fmt(balance, token.decimals)} ${token.symbol}`}</T>
        </Row>
        <Row gap={8}>
          <TextInput
            value={amount}
            onChangeText={(v) => setAmount(v.replace(',', '.').replace(/[^0-9.]/g, ''))}
            placeholder="0"
            placeholderTextColor={colors.textMute}
            inputMode="decimal"
            style={st.amount}
            selectionColor={colors.ink}
            accessibilityLabel={`Amount in ${token.symbol}`}
          />
          <T v="h3" color={colors.textDim}>
            {token.symbol}
          </T>
          <Pressable onPress={max} style={({ pressed }) => [st.max, pressed && { opacity: 0.7 }]} accessibilityLabel="Use the maximum">
            <T v="small" color={colors.ink} style={{ fontFamily: fonts.bodySemi }}>
              Max
            </T>
          </Pressable>
        </Row>
        <T v="mono" color={tooMuch ? colors.loss : colors.textDim} style={{ fontSize: 11 }}>
          {tooMuch ? 'More than this wallet holds' : usdValue !== null && usdValue > 0 ? `≈ ${usd(usdValue)}` : ' '}
        </T>
      </Card>

      {token.boughtByPlaybooks && openProtected > 0 ? (
        <Row gap={10} style={st.warn}>
          <TriangleAlert size={18} strokeWidth={1.75} color={colors.warn} />
          <T v="small" style={{ flex: 1 }}>
            {openProtected} open {openProtected === 1 ? 'position sells' : 'positions sell'} this {token.symbol} at take profit or stop. Sending it
            away ends that protection.
          </T>
        </Row>
      ) : null}

      {error ? (
        <T v="small" color={colors.loss} style={{ marginTop: space(3) }}>
          {error}
        </T>
      ) : null}
      <Button title={busy ?? 'Review and send'} loading={!!busy && busy !== 'Waiting for your confirmation'} disabled={!canSend} onPress={send} style={{ marginTop: space(5) }} />
      <T v="mono" style={{ textAlign: 'center', marginTop: space(2) }}>
        You review it, then confirm with your fingerprint or PIN
      </T>
      {bal.loading && !bal.data ? <ActivityIndicator color={colors.textDim} style={{ marginTop: space(4) }} /> : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  token: { alignItems: 'center', gap: 4, width: 96 },
  tokenCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderHi,
  },
  tokenOn: { backgroundColor: colors.accent, borderColor: colors.ink, borderWidth: 1.5 },
  tick: {
    position: 'absolute',
    right: -2,
    top: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addr: { flex: 1, height: 48, color: colors.text, fontFamily: fonts.mono, fontSize: 13, paddingHorizontal: space(3), borderRadius: radius.sm, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.borderHi },
  paste: { width: 48, height: 48, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.borderHi },
  amount: { flex: 1, color: colors.text, fontFamily: fonts.display, fontSize: 32, paddingVertical: 4 },
  max: { paddingHorizontal: space(3), height: 32, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.accent, borderWidth: 1.25, borderColor: colors.ink },
  warn: { marginTop: space(3), padding: space(4), borderRadius: radius.md, backgroundColor: colors.warnSoft, borderWidth: 1, borderColor: '#EAD7B3' },
  ticket: { borderRadius: radius.xl, borderWidth: 1.25, borderColor: colors.ink, backgroundColor: colors.card, overflow: 'hidden' },
  ticketHead: { backgroundColor: colors.accent, alignItems: 'center', paddingVertical: space(5), borderBottomWidth: 1.25, borderBottomColor: colors.ink },
  okDot: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
});
