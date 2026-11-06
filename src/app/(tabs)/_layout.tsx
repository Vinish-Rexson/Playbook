import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/TabBar';
import { colors } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

export default function TabsLayout() {
  const w = useWallet();
  if (w.status === 'none') return <Redirect href="/onboarding" />;
  if (w.status === 'locked') return <Redirect href="/unlock" />;
  return (
    <Tabs
      tabBar={(props) => <TabBar state={props.state} onSelect={props.navigateToTab} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
      <Tabs.Screen name="create" options={{ title: 'Create' }} />
      <Tabs.Screen name="positions" options={{ title: 'Positions' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
