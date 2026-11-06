// Wallet on the Profile tab: the wallet card (total per network), quick actions, tokens, backup and security.
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ArrowDownUp, ArrowUpRight, Check, ChevronRight, Copy, Eye, EyeOff, ExternalLink, KeyRound, Lock, QrCode, Trash2, TriangleAlert } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { NETWORK_DOT, NetworkSwitch } from '@/components/NetworkSwitch';
import { useFetch } from '@/hooks/useFetch';
import { usePrice } from '@/hooks/usePrice';
import { balancesOf, solBalancesOf } from '@/lib/chain';
import { addressUrl, NETWORKS, type Chain } from '@/lib/constants';
import { shortAddr, usd } from '@/lib/pricing';
import { Card, Row } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, fonts, radius, space } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

function Action({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.action, { transform: [{ scale: pressed ? 0.95 : 1 }] }]} accessibilityLabel={label}>
      <View style={st.actionIcon}>{icon}</View>
      <T v="small" color={colors.text} style={{ fontFamily: fonts.bodyMed }}>
        {label}
      </T>
    </Pressable>
  );
}

function TokenRow({ symbol, name, dot, amount, value, first }: { symbol: string; name: string; dot: string; amount: string; value?: string; first?: boolean }) {
  return (
    <Row gap={12} style={[{ minHeight: 56 }, !first && st.line]}>
      <View style={[st.tokenIcon, { backgroundColor: dot }]}>
        <T v="small" color={dot === colors.ink ? colors.onInk : colors.ink} style={{ fontFamily: fonts.bodySemi }}>
          {symbol.slice(0, 1)}
        </T>
      </View>
      <View style={{ flex: 1 }}>
        <T v="bodyMed">{symbol}</T>
        <T v="small">{name}</T>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T v="num" style={{ fontSize: 15 }}>
          {amount}
        </T>
        {value ? <T v="mono">{value}</T> : null}
      </View>
    </Row>
  );
}

function SettingRow({ icon, title, value, onPress, danger, first }: { icon: ReactNode; title: string; value?: string; onPress: () => void; danger?: boolean; first?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ minHeight: 52, justifyContent: 'center' }, !first && st.line, pressed && { opacity: 0.6 }]}>
      <Row gap={12}>
        <View style={{ width: 20, alignItems: 'center' }}>{icon}</View>
        <T v="bodyMed" color={danger ? colors.loss : colors.text} style={{ flex: 1 }}>
          {title}
        </T>
        {value ? <T v="small">{value}</T> : null}
        <ChevronRight size={18} strokeWidth={1.75} color={colors.textMute} />
      </Row>
    </Pressable>
  );
}

type Balances = { usdc: number; gas: number; bought: number };

const loadBalances = async (chain: Chain, addr: string | null): Promise<Balances | null> => {
  if (!addr) return null;
  if (chain === 'solana') {
    const b = await solBalancesOf(addr);
    return { usdc: b.usdc, gas: b.sol, bought: b.wsol };
  }
  const b = await balancesOf(addr as `0x${string}`);
  return { usdc: b.usdc, gas: b.eth, bought: b.weth };
};

/** The wallet card: white face with a lime band and an ink corner, drawn in code. */
function WalletCard({ chain, addr, total, hidden, onToggle, onCopy, copied }: {
  chain: Chain;
  addr: string | null;
  total: number | null;
  hidden: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  const [w, setW] = useState(0);
  const H = 196;
  return (
    <View style={st.walletCard} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w ? (
        <Svg width={w} height={H} style={StyleSheet.absoluteFill}>
          <Path d={`M0 ${H * 0.52} L${w * 0.7} ${H * 0.52} L${w * 0.58} ${H} L0 ${H} Z`} fill={colors.accent} />
          <Path d={`M${w * 0.74} 0 L${w} 0 L${w} ${H} L${w * 0.6} ${H} Z`} fill={colors.ink} />
        </Svg>
      ) : null}
      <View style={{ padding: space(5), flex: 1, justifyContent: 'space-between' }}>
        <View>
          <Row gap={6}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: NETWORK_DOT[chain] }} />
            <T v="small" color={colors.text} style={{ fontFamily: fonts.bodyMed }}>
              Playbook wallet · {NETWORKS[chain].name}
            </T>
          </Row>
          <Pressable onPress={onCopy} hitSlop={8} style={st.addrPill} accessibilityLabel="Copy address">
            <T v="mono" color={colors.text}>
              {addr ? shortAddr(addr) : 'No address'}
            </T>
            {copied ? <Check size={12} color={colors.profit} /> : <Copy size={12} strokeWidth={1.75} color={colors.textDim} />}
          </Pressable>
        </View>
        <View>
          <T v="small" color={colors.ink}>
            Total on {NETWORKS[chain].name}
          </T>
          <Row gap={10}>
            <T v="hero" color={colors.ink} style={{ fontSize: 32, lineHeight: 38 }}>
              {hidden ? '••••••' : total === null ? '—' : usd(total)}
            </T>
            <Pressable onPress={onToggle} hitSlop={10} accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'}>
              {hidden ? <EyeOff size={18} strokeWidth={1.75} color={colors.ink} /> : <Eye size={18} strokeWidth={1.75} color={colors.ink} />}
            </Pressable>
          </Row>
        </View>
      </View>
    </View>
  );
}

export function WalletHome() {
  const w = useWallet();
  const [chain, setChain] = useState<Chain>('base');
  const net = NETWORKS[chain];
  const addr = chain === 'solana' ? w.solAddress : w.address;
  const price = usePrice(chain);
  const [copied, setCopied] = useState(false);
  const [hidden, setHidden] = useState(false);
  const bal = useFetch(() => loadBalances(chain, addr), [chain, addr], 20_000);

  const p = price?.price ?? 0;
  const total = bal.data ? bal.data.usdc + (bal.data.gas + bal.data.bought) * p : null;
  const isPhrase = w.meta?.kind === 'mnemonic';
  const needsBackup = isPhrase && !w.meta?.backedUp;
  const dp = chain === 'solana' ? 4 : 5;

  const copy = async () => {
    if (!addr) return;
    await Clipboard.setStringAsync(addr);
    Haptics.selectionAsync().catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <NetworkSwitch value={chain} showAsset={false} onChange={setChain} />

      <View style={{ marginTop: space(4) }}>
        <WalletCard chain={chain} addr={addr} total={addr ? total : null} hidden={hidden} onToggle={() => setHidden((v) => !v)} onCopy={copy} copied={copied} />
      </View>

      {!addr ? (
        <Card style={{ marginTop: space(4), gap: space(2) }}>
          <T v="h3">No Solana account</T>
          <T v="small">
            This wallet was imported with an Ethereum private key, which has no Solana account. Wallets created or imported
            with a recovery phrase get both.
          </T>
        </Card>
      ) : (
        <>
          <Row style={{ justifyContent: 'space-between', marginTop: space(5), paddingHorizontal: space(2) }}>
            <Action
              icon={<ArrowUpRight size={20} strokeWidth={1.75} color={colors.text} />}
              label="Send"
              onPress={() => router.push({ pathname: '/wallet/send', params: { chain } })}
            />
            <Action
              icon={<QrCode size={20} strokeWidth={1.75} color={colors.text} />}
              label="Receive"
              onPress={() => router.push({ pathname: '/wallet/receive', params: { chain } })}
            />
            {chain === 'base' ? (
              <Action icon={<ArrowDownUp size={20} strokeWidth={1.75} color={colors.text} />} label="Swap" onPress={() => router.push('/wallet/swap')} />
            ) : null}
            <Action icon={copied ? <Check size={20} color={colors.profit} /> : <Copy size={20} strokeWidth={1.75} color={colors.text} />} label="Copy" onPress={copy} />
            <Action icon={<ExternalLink size={20} strokeWidth={1.75} color={colors.text} />} label="Explorer" onPress={() => Linking.openURL(addressUrl(addr, chain))} />
          </Row>

          <T v="h2" style={{ marginTop: space(7), marginBottom: space(2) }}>
            Tokens on {net.name}
          </T>
          <Card style={{ paddingVertical: space(1) }}>
            <TokenRow
              first
              symbol="USDC"
              name="Spent by playbooks"
              dot="#D3E3F3"
              amount={bal.data ? bal.data.usdc.toFixed(2) : '…'}
              value={bal.data ? usd(bal.data.usdc) : undefined}
            />
            <TokenRow
              symbol={net.gas}
              name="Network fees"
              dot={colors.cardHi}
              amount={bal.data ? bal.data.gas.toFixed(dp) : '…'}
              value={bal.data && p ? usd(bal.data.gas * p) : undefined}
            />
            <TokenRow
              symbol={net.bought}
              name="Bought by playbooks"
              dot={colors.accent}
              amount={bal.data ? bal.data.bought.toFixed(dp) : '…'}
              value={bal.data && p ? usd(bal.data.bought * p) : undefined}
            />
          </Card>
          {bal.error && !bal.data ? (
            <T v="small" color={colors.loss} style={{ marginTop: space(2) }}>
              Could not load balances
            </T>
          ) : null}
        </>
      )}

      {needsBackup ? (
        <Pressable onPress={() => router.push('/wallet/secret')} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
          <Row gap={12} style={st.backup}>
            <TriangleAlert size={18} strokeWidth={1.75} color={colors.warn} />
            <View style={{ flex: 1 }}>
              <T v="bodyMed">Back up your recovery phrase</T>
              <T v="small">Without it, losing this phone means losing your funds</T>
            </View>
            <ChevronRight size={18} strokeWidth={1.75} color={colors.warn} />
          </Row>
        </Pressable>
      ) : null}

      <T v="h2" style={{ marginTop: space(7), marginBottom: space(2) }}>
        Security
      </T>
      <Card style={{ paddingVertical: space(1) }}>
        <SettingRow
          first
          icon={<KeyRound size={18} strokeWidth={1.75} color={colors.text} />}
          title={isPhrase ? 'Recovery phrase' : 'Private key'}
          value={isPhrase ? (w.meta?.backedUp ? 'Backed up' : 'Not backed up') : undefined}
          onPress={() => router.push('/wallet/secret')}
        />
        <SettingRow
          icon={<Lock size={18} strokeWidth={1.75} color={colors.text} />}
          title="Auto-lock"
          value="5 min in background"
          onPress={() => {
            w.lock();
            router.replace('/unlock');
          }}
        />
        <SettingRow
          icon={<Trash2 size={18} strokeWidth={1.75} color={colors.loss} />}
          title="Remove from this phone"
          danger
          onPress={() =>
            Alert.alert(
              'Remove wallet?',
              'Your funds stay on Base and Solana, but you will need your recovery phrase or private key to get back in. Make sure it is backed up.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: async () => {
                    if (await w.removeWallet()) router.replace('/');
                  },
                },
              ],
            )
          }
        />
      </Card>
    </>
  );
}

const st = StyleSheet.create({
  walletCard: {
    height: 196,
    borderRadius: radius.xl,
    borderWidth: 1.25,
    borderColor: colors.ink,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  addrPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: space(2),
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.bg,
  },
  action: { alignItems: 'center', gap: 8, width: 64 },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderHi,
  },
  tokenIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderHi },
  backup: {
    marginTop: space(4),
    padding: space(4),
    borderRadius: radius.md,
    backgroundColor: colors.warnSoft,
    borderWidth: 1,
    borderColor: '#EAD7B3',
  },
});
