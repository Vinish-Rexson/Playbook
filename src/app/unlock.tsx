import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Fingerprint, TriangleAlert } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { shortAddr } from '@/lib/pricing';
import { Button, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, gradients, space } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

export default function Unlock() {
  const w = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tryUnlock = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (await w.unlock()) router.replace('/discover');
      else setError('Not unlocked. Try again.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [w]);

  // Prompt once when the screen opens; later attempts come from the button.
  useEffect(() => {
    if (w.status !== 'locked') {
      if (w.status !== 'loading') router.replace('/');
      return;
    }
    let off = false;
    w.unlock()
      .then((ok) => {
        if (ok) router.replace('/discover');
      })
      .catch((e) => {
        if (!off) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space(4) }}>
        <Animated.View entering={FadeInDown.duration(450)} style={{ alignItems: 'center', gap: space(3) }}>
          <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.logo}>
            <T v="h1" color="#fff">
              P
            </T>
          </LinearGradient>
          <T v="h1">Welcome back</T>
          <View style={st.addr}>
            <T v="num" color={colors.textDim} style={{ fontSize: 14 }}>
              {shortAddr(w.address)}
            </T>
          </View>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(200)}>
          <Pressable onPress={tryUnlock} disabled={busy} style={({ pressed }) => [st.fp, pressed && { opacity: 0.8 }]}>
            <Fingerprint size={44} color={colors.cyan} strokeWidth={1.5} />
          </Pressable>
        </Animated.View>

        {error ? (
          <T v="small" color={colors.loss} style={{ textAlign: 'center' }}>
            {error}
          </T>
        ) : (
          <T v="small">Use your fingerprint, face or PIN</T>
        )}

        {!w.deviceSecure ? (
          <Row gap={10} style={st.warn}>
            <TriangleAlert size={18} color={colors.warn} />
            <T v="small" color={colors.warn} style={{ flex: 1 }}>
              This phone has no screen lock, so anyone holding it can open your wallet. Set one in Android settings.
            </T>
          </Row>
        ) : null}
      </View>
      <Button title="Unlock" loading={busy} onPress={tryUnlock} style={{ marginBottom: space(10) }} />
    </Screen>
  );
}

const st = StyleSheet.create({
  logo: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  addr: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.cardHi,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fp: {
    width: 104,
    height: 104,
    borderRadius: 52,
    marginTop: space(6),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3DD6FF10',
    borderWidth: 1,
    borderColor: '#3DD6FF40',
  },
  warn: {
    marginTop: space(4),
    padding: space(3),
    borderRadius: 14,
    backgroundColor: '#FFB54712',
    borderWidth: 1,
    borderColor: '#FFB54744',
  },
});
