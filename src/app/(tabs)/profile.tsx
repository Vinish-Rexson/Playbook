import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Copy, LogOut, QrCode } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import QRCodeStyled from 'react-native-qrcode-styled';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ModeBadge } from '@/components/ModeBadge';
import { RuleChips } from '@/components/Playbook';
import { useFetch } from '@/hooks/useFetch';
import { usePrice } from '@/hooks/usePrice';
import { api } from '@/lib/api';
import { balancesOf } from '@/lib/chain';
import { shortAddr, usd } from '@/lib/pricing';
import { Avatar, Button, Card, Divider, KV, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, space } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

export default function Profile() {
  const w = useWallet();
  const price = usePrice();
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const me = useFetch(() => (w.address ? api.trader(w.address) : Promise.resolve(null)), [w.address], 10_000);
  const bal = useFetch(
    () => (w.mode === 'privy' && w.address ? balancesOf(w.address) : Promise.resolve(null)),
    [w.address, w.mode],
    20_000,
  );

  const trader = me.data?.trader;
  const earnings = me.data?.earnings;

  return (
    <Screen onRefresh={() => { me.reload(); bal.reload(); }} refreshing={me.refreshing}>
      <Row style={{ justifyContent: 'space-between', marginTop: space(3), marginBottom: space(5) }}>
        <T v="h1">Profile</T>
        <ModeBadge />
      </Row>

      {/* Wallet */}
      <Card>
        <T v="label">{w.mode === 'paper' ? 'Paper wallet' : 'Your wallet · Base'}</T>
        <Row style={{ justifyContent: 'space-between', marginTop: space(2) }}>
          <T v="h2">{shortAddr(w.address)}</T>
          <Row gap={14}>
            <Pressable
              hitSlop={10}
              onPress={async () => {
                if (!w.address) return;
                await Clipboard.setStringAsync(w.address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}>
              <Copy size={20} color={copied ? colors.profit : colors.textDim} />
            </Pressable>
            {w.mode === 'privy' ? (
              <Pressable hitSlop={10} onPress={() => setShowQr((v) => !v)}>
                <QrCode size={20} color={showQr ? colors.cyan : colors.textDim} />
              </Pressable>
            ) : null}
          </Row>
        </Row>
        {w.mode === 'privy' ? (
          <>
            <Divider />
            <KV k="USDC" v={bal.data ? usd(bal.data.usdc) : '…'} />
            <KV k="ETH (for approvals)" v={bal.data ? `${bal.data.eth.toFixed(5)} ETH` : '…'} />
            <KV k="WETH" v={bal.data ? `${bal.data.weth.toFixed(5)}${price ? ` · ${usd(bal.data.weth * price.price)}` : ''}` : '…'} />
            {showQr && w.address ? (
              <Animated.View entering={FadeIn} style={{ alignItems: 'center', marginTop: space(4), gap: space(2) }}>
                <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 8 }}>
                  <QRCodeStyled data={w.address} pieceSize={6} padding={8} />
                </View>
                <T v="small" style={{ textAlign: 'center' }}>
                  Send USDC and a little ETH on Base to this address to trade live.
                </T>
              </Animated.View>
            ) : null}
          </>
        ) : (
          <T v="small" style={{ marginTop: space(2) }}>
            Simulated balance. Log in with email to trade with a real wallet on Base.
          </T>
        )}
      </Card>

      {/* Creator */}
      {trader ? (
        <>
          <Card style={{ marginTop: space(4) }} glow>
            <Row gap={12}>
              <Avatar emoji={trader.avatar} size={52} />
              <View style={{ flex: 1 }}>
                <T v="h2">{trader.name}</T>
                <T v="small">@{trader.handle}</T>
              </View>
            </Row>
            {trader.bio ? (
              <T v="body" style={{ marginTop: space(3) }}>
                {trader.bio}
              </T>
            ) : null}
            <Divider />
            <T v="label">Creator earnings</T>
            <T v="hero" color={colors.cyan} style={{ marginTop: 4 }}>
              {usd((earnings?.liveUsd ?? 0) + (earnings?.paperUsd ?? 0))}
            </T>
            <T v="small">
              {earnings?.applies ?? 0} applies across {me.data?.templates.length ?? 0} playbooks
              {earnings?.paperUsd ? ` · ${usd(earnings.paperUsd)} from paper trades` : ''}
            </T>
          </Card>

          <T v="h2" style={{ marginTop: space(7), marginBottom: space(3) }}>
            Your playbooks
          </T>
          <View style={{ gap: space(3) }}>
            {me.data?.templates.map((t) => (
              <Pressable key={t.id} onPress={() => router.push({ pathname: '/template/[id]', params: { id: t.id } })}>
                <Card style={{ gap: space(2) }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T v="h3">{t.name}</T>
                    <T v="small">{t.stats.applies} applied</T>
                  </Row>
                  <RuleChips t={t} />
                </Card>
              </Pressable>
            ))}
            {me.data?.templates.length === 0 ? (
              <Button title="Publish your first playbook" variant="secondary" onPress={() => router.navigate('/create')} />
            ) : null}
          </View>
        </>
      ) : (
        <Card style={{ marginTop: space(4), gap: space(3) }}>
          <T v="h2">Share your strategy</T>
          <T v="body">Create a profile, publish a playbook and earn a cut every time someone applies it.</T>
          <Button title="Become a creator" size="md" onPress={() => router.navigate('/create')} />
        </Card>
      )}

      <Button
        title={w.mode === 'paper' ? 'Leave Paper mode' : 'Log out'}
        variant="ghost"
        icon={<LogOut size={18} color={colors.textDim} />}
        style={{ marginTop: space(8) }}
        onPress={async () => {
          await w.logout();
          router.replace('/login');
        }}
      />
      <T v="small" style={{ textAlign: 'center', marginTop: space(2) }}>
        Trades execute on Base through Definitive Flash.
        {price?.devKey ? '\nDev mode: using the public Flash dev key, creator fees are not collected.' : ''}
      </T>
    </Screen>
  );
}
