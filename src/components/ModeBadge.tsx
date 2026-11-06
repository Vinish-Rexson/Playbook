import { Pill } from '@/ui/primitives';
import { colors } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

export function ModeBadge() {
  const w = useWallet();
  if (w.mode === 'paper') return <Pill label="Paper" color={colors.warn} />;
  if (w.mode === 'privy') return <Pill label="Live · Base" color={colors.profit} />;
  return null;
}
