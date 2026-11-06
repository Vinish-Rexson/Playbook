import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { colors } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

export default function Gate() {
  const w = useWallet();
  if (!w.ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }
  return <Redirect href={w.address ? '/discover' : '/login'} />;
}
