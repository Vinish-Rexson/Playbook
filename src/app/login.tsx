import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { FlaskConical, ShieldCheck, Sparkles, Zap } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button, Card, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, gradients, space } from '@/ui/theme';
import { EmailLogin } from '@/wallet/EmailLogin';
import { useWallet } from '@/wallet/WalletProvider';

const FEATURES = [
  { icon: Sparkles, text: 'Pick a strategy a trader published' },
  { icon: Zap, text: 'Apply it in one tap, executed by Definitive Flash' },
  { icon: ShieldCheck, text: 'Every trade has a stop-loss. Creators earn a cut.' },
];

export default function Login() {
  const w = useWallet();
  const [paperBusy, setPaperBusy] = useState(false);

  useEffect(() => {
    if (w.address) router.replace('/discover');
  }, [w.address]);

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View entering={FadeInDown.duration(500)} style={{ marginTop: space(10), gap: space(4) }}>
          <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
            <T v="h1" color="#fff">
              P
            </T>
          </LinearGradient>
          <T v="hero">
            Trading strategies,{'\n'}
            <T v="hero" color={colors.cyan}>
              one tap away.
            </T>
          </T>
          <T v="body" style={{ fontSize: 16 }}>
            Playbook turns a trader’s rules into a template anyone can apply to their own wallet.
          </T>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(500)} style={{ marginTop: space(7), gap: space(3) }}>
          {FEATURES.map(({ icon: Icon, text }) => (
            <Row key={text} gap={12}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.cardHi, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} color={colors.cyan} />
              </View>
              <T v="bodyMed" style={{ flex: 1 }}>
                {text}
              </T>
            </Row>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(500)} style={{ marginTop: space(8) }}>
          <Card style={{ gap: space(3) }}>
            {w.privyEnabled ? (
              <>
                <T v="label">Trade live on Base</T>
                <EmailLogin />
              </>
            ) : (
              <T v="small">
                Live trading needs a Privy app ID (EXPO_PUBLIC_PRIVY_APP_ID). Paper mode works right away.
              </T>
            )}
            <Button
              title="Try Paper mode"
              variant="secondary"
              loading={paperBusy}
              icon={<FlaskConical size={18} color={colors.warn} />}
              onPress={async () => {
                setPaperBusy(true);
                await w.enterPaper();
                setPaperBusy(false);
              }}
            />
            <T v="small" style={{ textAlign: 'center' }}>
              Paper mode simulates fills with live ETH prices. No wallet or funds needed.
            </T>
          </Card>
        </Animated.View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
