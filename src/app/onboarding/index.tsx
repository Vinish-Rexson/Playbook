import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Download, Lock, Plus, ShieldCheck, Sparkles, Zap } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button, Card, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, gradients, space } from '@/ui/theme';

const FEATURES = [
  { icon: Sparkles, text: 'Pick a strategy a trader published' },
  { icon: Zap, text: 'Apply it in one tap, executed by Definitive Flash' },
  { icon: ShieldCheck, text: 'Every trade has a stop-loss. Creators earn a cut.' },
];

export default function Welcome() {
  return (
    <Screen>
      <Animated.View entering={FadeInDown.duration(500)} style={{ marginTop: space(8), gap: space(4) }}>
        <LinearGradient
          colors={gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
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

      <Animated.View entering={FadeInDown.delay(120).duration(500)} style={{ marginTop: space(6), gap: space(3) }}>
        {FEATURES.map(({ icon: Icon, text }) => (
          <Row key={text} gap={12}>
            <View
              style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.cardHi, alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={18} color={colors.cyan} />
            </View>
            <T v="bodyMed" style={{ flex: 1 }}>
              {text}
            </T>
          </Row>
        ))}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(240).duration(500)} style={{ marginTop: space(7) }}>
        <Card style={{ gap: space(3) }}>
          <T v="label">Your wallet · Base</T>
          <Button
            title="Create a new wallet"
            icon={<Plus size={20} color="#fff" />}
            onPress={() => router.push('/onboarding/create')}
          />
          <Button
            title="Import existing wallet"
            variant="secondary"
            icon={<Download size={18} color={colors.text} />}
            onPress={() => router.push('/onboarding/import')}
          />
          <Row gap={8} style={{ justifyContent: 'center', marginTop: space(1) }}>
            <Lock size={13} color={colors.textMute} />
            <T v="small" color={colors.textMute}>
              Self-custody. Keys stay encrypted on this phone.
            </T>
          </Row>
        </Card>
      </Animated.View>
    </Screen>
  );
}
