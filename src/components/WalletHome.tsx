// Wallet home on the Profile tab: balance, receive, tokens, backup and security.
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Check, ChevronRight, Copy, ExternalLink, KeyRound, Lock, QrCode, Trash2, TriangleAlert } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import QRCodeStyled from 'react-native-qrcode-styled';
import Animated, { FadeIn } from 'react-native-reanimated';

import { NetworkSwitch } from '@/components/NetworkSwitch';
import { useFetch } from '@/hooks/useFetch';
import { usePrice } from '@/hooks/usePrice';
import { balancesOf, solBalancesOf } from '@/lib/chain';
import { addressUrl, NETWORKS, type Chain } from '@/lib/constants';
import { shortAddr, usd } from '@/lib/pricing';
import { Card, Divider, Row } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, radius, space } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

function Action({ icon, label, onPress, active }: { icon: ReactNode; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.action, pressed && { opacity: 0.75 }]}>
      <View style={[st.actionIcon, active && { borderColor: '#3DD6FF88', backgroundColor: '#3DD6FF1A' }]}>{icon}</View>
      <T v="small" color={colors.text} style={{ fontFamily: 'Inter_500Medium' }}>
        {label}
      </T>
    </Pressable>
  );
}

function TokenRow({ symbol, name, color, amount, value }: { symbol: string; name: string; color: string; amount: string; value?: string }) {
  return (
    <Row gap={12} style={{ paddingVertical: space(2) }}>
      <View style={[st.tokenIcon, { backgroundColor: `${color}26`, borderColor: `${color}66` }]}>
        <T v="small" color={color} style={{ fontFamily: 'Inter_600SemiBold' }}>
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
        {value ? <T v="small">{value}</T> : null}
      </View>
    </Row>
  );
}

function SettingRow({ icon, title, sub, onPress, danger }: { icon: ReactNode; title: string; sub: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ paddingVertical: space(3) }, pressed && { opacity: 0.7 }]}>
      <Row gap={12}>
        <View style={[st.setIcon, danger && { backgroundColor: '#FF5C7A14' }]}>{icon}</View>
        <View style={{ flex: 1 }}>
          <T v="bodyMed" color={danger ? colors.loss : colors.text}>
            {title}
          </T>
          <T v="small">{sub}</T>
        </View>
        <ChevronRight size={18} color={colors.textMute} />
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

export function WalletHome() {
  const w = useWallet();
  const [chain, setChain] = useState<Chain>('base');
  const net = NETWORKS[chain];
  const addr = chain === 'solana' ? w.solAddress : w.address;
  const price = usePrice(chain);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const bal = useFetch(() => loadBalances(chain, addr), [chain, addr], 20_000);

  const p = price?.price ?? 0;
  const total = bal.data ? bal.data.usdc + (bal.data.gas + bal.data.bought) * p : null;
  const isPhrase = w.meta?.kind === 'mnemonic';
  const needsBackup = isPhrase && !w.meta?.backedUp;

  const copy = async () => {
    if (!addr) return;
    await Clipboard.setStringAsync(addr);
    Haptics.selectionAsync().catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <Card glow>
        <NetworkSwitch
          value={chain}
          showAsset={false}
          onChange={(c) => {
            setChain(c);
            setShowQr(false);
          }}
        />
        {!addr ? (
          <View style={{ paddingVertical: space(5), gap: space(2) }}>
            <T v="h2">No Solana account</T>
            <T v="body">
              This wallet was imported with an Ethereum private key, which has no Solana account. Wallets created or imported
              with a recovery phrase get both, like MetaMask.
            </T>
          </View>
        ) : (
          <>
            <Row style={{ justifyContent: 'space-between', marginTop: space(4) }}>
              <T v="label">Wallet · {net.name}</T>
              <Pressable onPress={copy} hitSlop={8} style={st.addrPill}>
                <T v="small" color={colors.textDim} style={{ fontFamily: 'Inter_500Medium' }}>
                  {shortAddr(addr)}
                </T>
                {copied ? <Check size={13} color={colors.profit} /> : <Copy size={13} color={colors.textMute} />}
              </Pressable>
            </Row>
            <T v="hero" style={{ marginTop: space(3) }}>
              {total === null ? '—' : usd(total)}
            </T>
            <T v="small">{bal.error && !bal.data ? 'Could not load balances' : `Total on ${net.name}`}</T>

            <Row style={{ justifyContent: 'space-around', marginTop: space(5) }}>
              <Action
                icon={<QrCode size={20} color={colors.cyan} />}
                label="Receive"
                active={showQr}
                onPress={() => setShowQr((v) => !v)}
              />
              <Action icon={copied ? <Check size={20} color={colors.profit} /> : <Copy size={20} color={colors.cyan} />} label="Copy" onPress={copy} />
              <Action
                icon={<ExternalLink size={20} color={colors.cyan} />}
                label="Explorer"
                onPress={() => Linking.openURL(addressUrl(addr, chain))}
              />
            </Row>

            {showQr ? (
              <Animated.View entering={FadeIn} style={{ alignItems: 'center', marginTop: space(5), gap: space(3) }}>
                <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 10 }}>
                  <QRCodeStyled data={addr} pieceSize={chain === 'solana' ? 5 : 6} padding={8} />
                </View>
                <T v="num" style={{ fontSize: 12, textAlign: 'center' }} color={colors.textDim}>
                  {addr}
                </T>
                <T v="small" style={{ textAlign: 'center' }}>
                  {chain === 'solana'
                    ? 'Send USDC and a little SOL (about 0.02) on the Solana network only.'
                    : 'Send USDC and a little ETH on the Base network only.'}
                </T>
              </Animated.View>
            ) : null}

            <Divider />
            <TokenRow
              symbol="USDC"
              name="USD Coin"
              color="#2775CA"
              amount={bal.data ? bal.data.usdc.toFixed(2) : '…'}
              value={bal.data ? usd(bal.data.usdc) : undefined}
            />
            <TokenRow
              symbol={net.gas}
              name="For network fees"
              color={chain === 'solana' ? '#14F195' : '#8A92B2'}
              amount={bal.data ? bal.data.gas.toFixed(chain === 'solana' ? 4 : 5) : '…'}
              value={bal.data && p ? usd(bal.data.gas * p) : undefined}
            />
            <TokenRow
              symbol={net.bought}
              name="Bought by playbooks"
              color={colors.primary}
              amount={bal.data ? bal.data.bought.toFixed(chain === 'solana' ? 4 : 5) : '…'}
              value={bal.data && p ? usd(bal.data.bought * p) : undefined}
            />
          </>
        )}
      </Card>

      {needsBackup ? (
        <Pressable onPress={() => router.push('/wallet/secret')}>
          <Row gap={12} style={st.backup}>
            <TriangleAlert size={20} color={colors.warn} />
            <View style={{ flex: 1 }}>
              <T v="bodyMed">Back up your recovery phrase</T>
              <T v="small">Without it, losing this phone means losing your funds.</T>
            </View>
            <ChevronRight size={18} color={colors.warn} />
          </Row>
        </Pressable>
      ) : null}

      <Card style={{ marginTop: space(4), paddingVertical: space(1) }}>
        <SettingRow
          icon={<KeyRound size={18} color={colors.cyan} />}
          title={isPhrase ? 'Recovery phrase' : 'Private key'}
          sub="View and back up"
          onPress={() => router.push('/wallet/secret')}
        />
        <SettingRow
          icon={<Lock size={18} color={colors.cyan} />}
          title="Lock wallet"
          sub="Fingerprint or PIN to open again"
          onPress={() => {
            w.lock();
            router.replace('/unlock');
          }}
        />
        <SettingRow
          icon={<Trash2 size={18} color={colors.loss} />}
          title="Remove from this phone"
          sub="Funds stay on Base and Solana"
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
  addrPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.cardHi,
    borderWidth: 1,
    borderColor: colors.border,
  },
  action: { alignItems: 'center', gap: 6, minWidth: 72 },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardHi,
    borderWidth: 1,
    borderColor: colors.borderHi,
  },
  tokenIcon: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  setIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: '#3DD6FF12', alignItems: 'center', justifyContent: 'center' },
  backup: {
    marginTop: space(4),
    padding: space(4),
    borderRadius: radius.lg,
    backgroundColor: '#FFB54712',
    borderWidth: 1,
    borderColor: '#FFB54755',
  },
});
