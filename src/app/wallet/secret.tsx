import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { EyeOff, ShieldAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button, Header, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, radius, space } from '@/ui/theme';
import type { SecretKind } from '@/wallet/keys';
import { PhraseGrid } from '@/wallet/PhraseGrid';
import { useWallet } from '@/wallet/WalletProvider';

export default function RevealSecret() {
  usePreventScreenCapture();
  const w = useWallet();
  const [secret, setSecret] = useState<{ kind: SecretKind; value: string } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await w.revealSecret().catch(() => null);
      if (!s) router.back();
      else setSecret(s);
    })();
    // Authenticate once when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPhrase = secret?.kind === 'mnemonic';
  const needsBackup = isPhrase && w.meta && !w.meta.backedUp;

  return (
    <Screen>
      <Header title={isPhrase || !secret ? 'Recovery phrase' : 'Private key'} onBack={() => router.back()} />
      {!secret ? (
        <ActivityIndicator color={colors.cyan} style={{ marginTop: space(16) }} />
      ) : (
        <Animated.View entering={FadeInDown.duration(350)} style={{ gap: space(4) }}>
          <Row gap={10} style={st.warn}>
            <ShieldAlert size={20} color={colors.loss} />
            <T v="small" color={colors.text} style={{ flex: 1 }}>
              Anyone with this {isPhrase ? 'phrase' : 'key'} can take everything in your wallet. Playbook will never ask
              for it.
            </T>
          </Row>

          {isPhrase ? (
            <PhraseGrid words={secret.value.split(' ')} hidden={!revealed} onReveal={() => setRevealed(true)} />
          ) : (
            <Pressable onPress={() => setRevealed(true)} style={st.keyBox}>
              {revealed ? (
                <T v="num" style={{ fontSize: 15, lineHeight: 24 }}>
                  {secret.value}
                </T>
              ) : (
                <Row gap={10} style={{ justifyContent: 'center', paddingVertical: space(4) }}>
                  <EyeOff size={18} color={colors.cyan} />
                  <T v="h3">Tap to reveal</T>
                </Row>
              )}
            </Pressable>
          )}

          <T v="small" style={{ textAlign: 'center' }}>
            Write it on paper and store it offline. Screenshots are blocked on this screen.
          </T>

          {needsBackup ? (
            <Button
              title="I’ve written it down"
              disabled={!revealed}
              loading={busy}
              onPress={async () => {
                setBusy(true);
                await w.markBackedUp();
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                router.back();
              }}
            />
          ) : (
            <Button title="Done" variant="secondary" onPress={() => router.back()} />
          )}
        </Animated.View>
      )}
      <View style={{ height: space(4) }} />
    </Screen>
  );
}

const st = StyleSheet.create({
  warn: {
    alignItems: 'flex-start',
    padding: space(3),
    borderRadius: radius.md,
    backgroundColor: '#FF5C7A10',
    borderWidth: 1,
    borderColor: '#FF5C7A40',
  },
  keyBox: {
    padding: space(4),
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
});
