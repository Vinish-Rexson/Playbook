import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ModeBadge } from '@/components/ModeBadge';
import { RuleChips } from '@/components/Playbook';
import { WalletHome } from '@/components/WalletHome';
import { useFetch } from '@/hooks/useFetch';
import { usePrice } from '@/hooks/usePrice';
import { api } from '@/lib/api';
import { usd } from '@/lib/pricing';
import { Avatar, Button, Card, Divider, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, space } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

export default function Profile() {
  const w = useWallet();
  const price = usePrice();
  const me = useFetch(() => (w.address ? api.trader(w.address) : Promise.resolve(null)), [w.address], 10_000);

  const trader = me.data?.trader;
  const earnings = me.data?.earnings;

  return (
    <Screen onRefresh={me.reload} refreshing={me.refreshing}>
      <Row style={{ justifyContent: 'space-between', marginTop: space(3), marginBottom: space(5) }}>
        <T v="h1">Profile</T>
        <ModeBadge />
      </Row>

      {/* Wallet */}
      <WalletHome />

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
              {usd(earnings?.feesUsd ?? 0)}
            </T>
            <T v="small">
              {earnings?.applies ?? 0} applies across {me.data?.templates.length ?? 0} playbooks · from Flash fill reports
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

      <T v="small" style={{ textAlign: 'center', marginTop: space(2) }}>
        Trades execute on Base through Definitive Flash.
        {price?.devKey ? '\nDev mode: using the public Flash dev key, creator fees are not collected.' : ''}
      </T>
    </Screen>
  );
}
