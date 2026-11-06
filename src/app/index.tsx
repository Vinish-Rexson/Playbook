import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { colors } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

export default function Gate() {
  const w = useWallet();
  if (w.status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }
  if (w.status === 'none') return <Redirect href="/onboarding" />;
  if (w.status === 'locked') return <Redirect href="/unlock" />;
  return <Redirect href="/discover" />;
}
