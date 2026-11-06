// Receive: a ticket with the network on top, the QR code, the full address and a copy button.
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Copy } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCodeStyled from 'react-native-qrcode-styled';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { NETWORK_DOT } from '@/components/NetworkSwitch';
import { NETWORKS, type Chain } from '@/lib/constants';
import { Button, Header, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, DUR, EASE, fonts, radius, space } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

export default function Receive() {
  const { chain: raw } = useLocalSearchParams<{ chain?: string }>();
  const chain: Chain = raw === 'solana' ? 'solana' : 'base';
  const net = NETWORKS[chain];
  const w = useWallet();
  const addr = chain === 'solana' ? w.solAddress : w.address;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!addr) return;
    await Clipboard.setStringAsync(addr);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Screen>
      <Header title="Receive" onBack={() => router.back()} />
      {addr ? (
        <Animated.View entering={FadeInDown.duration(DUR.enter).easing(Easing.bezier(...EASE))} style={st.ticket}>
          <Row gap={8} style={st.head}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: NETWORK_DOT[chain] }} />
            <T v="bodyMed" color={colors.ink} style={{ fontFamily: fonts.bodySemi }}>
              {net.name} network
            </T>
          </Row>
          <View style={st.body}>
            <View style={st.qr}>
              <QRCodeStyled data={addr} pieceSize={chain === 'solana' ? 6 : 7} padding={10} color={colors.ink} />
            </View>
            <View style={st.perforation}>
              <View style={[st.notch, { left: -12 }]} />
              <View style={st.dash} />
              <View style={[st.notch, { right: -12 }]} />
            </View>
            <T v="small" style={{ textAlign: 'center' }}>
              Wallet address
            </T>
            <T v="mono" color={colors.text} selectable style={{ textAlign: 'center', fontSize: 13, lineHeight: 20, marginTop: space(1) }}>
              {addr}
            </T>
            <Button
              title={copied ? 'Copied' : 'Copy address'}
              variant="accent"
              size="md"
              icon={copied ? <Check size={16} color={colors.ink} /> : <Copy size={16} strokeWidth={1.75} color={colors.ink} />}
              onPress={copy}
              style={{ marginTop: space(4), alignSelf: 'center' }}
            />
          </View>
          <View style={st.foot}>
            <T v="small" color={colors.onInk} style={{ textAlign: 'center' }}>
              Send only USDC and {net.gas} on the {net.name} network to this address. Other networks can lose funds.
            </T>
          </View>
        </Animated.View>
      ) : (
        <T v="body">This wallet has no {net.name} address.</T>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  ticket: { borderRadius: radius.xl, borderWidth: 1.25, borderColor: colors.ink, backgroundColor: colors.card, overflow: 'hidden' },
  head: { backgroundColor: colors.accent, paddingHorizontal: space(5), paddingVertical: space(4), justifyContent: 'center', borderBottomWidth: 1.25, borderBottomColor: colors.ink },
  body: { padding: space(5) },
  qr: { alignSelf: 'center', padding: space(2), borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  perforation: { height: 24, justifyContent: 'center', marginVertical: space(4), marginHorizontal: -space(5) },
  dash: { marginHorizontal: space(5), borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderHi },
  notch: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: colors.bg, borderWidth: 1.25, borderColor: colors.ink, top: 0 },
  foot: { backgroundColor: colors.ink, paddingHorizontal: space(5), paddingVertical: space(4) },
});
