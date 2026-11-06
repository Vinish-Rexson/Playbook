import { colors } from '@/ui/theme';
import { Pill } from '@/ui/primitives';
import { useWallet } from '@/wallet/WalletProvider';

/** "Live" when the wallet is unlocked and trades are real. */
export function ModeBadge() {
  const w = useWallet();
  if (w.mode === 'live') return <Pill label="Live" color={colors.profit} bg={colors.card} />;
  return null;
}
