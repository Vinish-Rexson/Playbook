import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Activity, Compass, PlusCircle, UserRound } from 'lucide-react-native';

import { colors, fonts } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

export default function TabsLayout() {
  const w = useWallet();
  if (w.status === 'none') return <Redirect href="/onboarding" />;
  if (w.status === 'locked') return <Redirect href="/unlock" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.cyan,
        tabBarInactiveTintColor: colors.textMute,
        tabBarLabelStyle: { fontFamily: fonts.bodySemi, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
          height: 68,
          paddingTop: 8,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: ({ color }) => <Compass size={22} color={color} /> }} />
      <Tabs.Screen name="create" options={{ title: 'Create', tabBarIcon: ({ color }) => <PlusCircle size={22} color={color} /> }} />
      <Tabs.Screen name="positions" options={{ title: 'Positions', tabBarIcon: ({ color }) => <Activity size={22} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <UserRound size={22} color={color} /> }} />
    </Tabs>
  );
}
