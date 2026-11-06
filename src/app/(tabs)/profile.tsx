import { router } from 'expo-router';
import { View } from 'react-native';

import { ModeBadge } from '@/components/ModeBadge';
import { TemplateCard } from '@/components/Playbook';
import { WalletHome } from '@/components/WalletHome';
import { useFetch } from '@/hooks/useFetch';
import { usePrice } from '@/hooks/usePrice';
import { api } from '@/lib/api';
import { usd } from '@/lib/pricing';
import { Avatar, Button, Card, Row, Screen, Ticket } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { space } from '@/ui/theme';
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
        <T v="h1">Wallet</T>
        <ModeBadge />
      </Row>

      <WalletHome />

      <T v="h2" style={{ marginTop: space(8), marginBottom: space(3) }}>
        Creator
      </T>
      {trader ? (
        <>
          <Card>
            <Row gap={12}>
              <Avatar name={trader.name} tone={trader.avatar} size={48} />
              <View style={{ flex: 1 }}>
                <T v="h3">{trader.name}</T>
                <T v="mono">@{trader.handle}</T>
              </View>
            </Row>
            {trader.bio ? (
              <T v="small" style={{ marginTop: space(3) }}>
                {trader.bio}
              </T>
            ) : null}
          </Card>
          <Row gap={12} style={{ marginTop: space(3) }}>
            <Ticket label="Creator earnings" style={{ flex: 1.3 }}>
              <T v="numLg">{usd(earnings?.feesUsd ?? 0)}</T>
              <T v="mono">from Flash fill reports</T>
            </Ticket>
            <Ticket label="Applies" style={{ flex: 1 }}>
              <T v="numLg">{earnings?.applies ?? 0}</T>
              <T v="mono">{me.data?.templates.length ?? 0} playbooks</T>
            </Ticket>
          </Row>

          <View style={{ gap: space(3), marginTop: space(4) }}>
            {me.data?.templates.map((t) => (
              <TemplateCard key={t.id} t={t} onPress={() => router.push({ pathname: '/template/[id]', params: { id: t.id } })} />
            ))}
            {me.data?.templates.length === 0 ? (
              <Button title="Publish your first playbook" variant="secondary" onPress={() => router.navigate('/create')} />
            ) : null}
          </View>
        </>
      ) : (
        <Card style={{ gap: space(3) }}>
          <T v="h3">Share your strategy</T>
          <T v="small">Create a profile, publish a playbook and earn a cut each time someone applies it.</T>
          <Button title="Become a creator" size="md" onPress={() => router.navigate('/create')} style={{ alignSelf: 'flex-start' }} />
        </Card>
      )}

      <T v="mono" style={{ textAlign: 'center', marginTop: space(6) }}>
        Orders execute on Base and Solana through Definitive Flash
        {price?.devKey ? '\nDev key in use: creator fees are not collected' : ''}
      </T>
    </Screen>
  );
}
