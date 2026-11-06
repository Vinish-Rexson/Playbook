import { router } from 'expo-router';
import { Fingerprint, TriangleAlert } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown } from 'react-native-reanimated';

import { shortAddr } from '@/lib/pricing';
import { Button, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, DUR, EASE, space } from '@/ui/theme';
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
        <Animated.View entering={FadeInDown.duration(DUR.enter).easing(Easing.bezier(...EASE))} style={{ alignItems: 'center', gap: space(3) }}>
          <Row gap={8}>
            <View style={st.mark} />
            <T v="h3">playbook</T>
          </Row>
          <T v="h1" style={{ marginTop: space(4) }}>
            Wallet locked
          </T>
          <View style={st.addr}>
            <T v="mono" color={colors.text}>
              {shortAddr(w.address)}
            </T>
          </View>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(120).duration(DUR.enter)}>
          <Pressable
            onPress={tryUnlock}
            disabled={busy}
            accessibilityLabel="Unlock with fingerprint, face or PIN"
            style={({ pressed }) => [st.fp, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
            <Fingerprint size={44} color={colors.ink} strokeWidth={1.5} />
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
  mark: { width: 18, height: 18, borderRadius: 5, backgroundColor: colors.ink, borderBottomWidth: 5, borderBottomColor: colors.accent },
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
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  warn: {
    marginTop: space(4),
    padding: space(3),
    borderRadius: 14,
    backgroundColor: colors.warnSoft,
    borderWidth: 1,
    borderColor: '#EAD7B3',
  },
});
