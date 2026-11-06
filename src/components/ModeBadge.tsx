import { Pill } from '@/ui/primitives';
import { colors } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

export function ModeBadge() {
  const w = useWallet();
  if (w.mode === 'live') return <Pill label="Live · Base" color={colors.profit} />;
  return null;
}
