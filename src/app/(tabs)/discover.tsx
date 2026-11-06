import { router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { EthTicker } from '@/components/EthTicker';
import { ModeBadge } from '@/components/ModeBadge';
import { TemplateCard } from '@/components/Playbook';
import { useFetch } from '@/hooks/useFetch';
import { api } from '@/lib/api';
import { Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, space } from '@/ui/theme';

export default function Discover() {
  const { data, loading, error, refreshing, reload } = useFetch(() => api.templates(), [], 15_000);

  return (
    <Screen onRefresh={reload} refreshing={refreshing}>
      <Row style={{ justifyContent: 'space-between', marginTop: space(3), marginBottom: space(5) }}>
        <T v="h1">Playbook</T>
        <ModeBadge />
      </Row>

      <EthTicker />

      <Row style={{ justifyContent: 'space-between', marginTop: space(8), marginBottom: space(3) }}>
        <T v="h2">Top playbooks</T>
        <T v="small">{data ? `${data.templates.length} live` : ''}</T>
      </Row>

      {loading && !data ? <ActivityIndicator color={colors.cyan} style={{ marginTop: space(8) }} /> : null}
      {error && !data ? (
        <T v="small" color={colors.loss}>
          Couldn’t reach the Playbook server: {error}
        </T>
      ) : null}

      <View style={{ gap: space(3) }}>
        {data?.templates.map((t, i) => (
          <Animated.View key={t.id} entering={FadeInDown.delay(60 * i).duration(400)}>
            <TemplateCard t={t} onPress={() => router.push({ pathname: '/template/[id]', params: { id: t.id } })} />
          </Animated.View>
        ))}
      </View>
    </Screen>
  );
}
