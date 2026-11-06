import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import { usePrice } from '@/hooks/usePrice';
import { usd } from '@/lib/pricing';
import { Row } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, radius, space } from '@/ui/theme';

export function EthTicker() {
  const p = usePrice();
  const ch = (p?.change24h ?? 0) * 100;
  return (
    <LinearGradient
      colors={['#1C1640', '#101528']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: radius.lg, padding: space(5), borderWidth: 1, borderColor: '#2E2A5C' }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="label" color={colors.textDim}>
          ETH · Base
        </T>
        <Row gap={6}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: p ? colors.profit : colors.textMute }} />
          <T v="small">{p ? 'Live' : 'Connecting…'}</T>
        </Row>
      </Row>
      <Row style={{ alignItems: 'flex-end', marginTop: space(2) }} gap={10}>
        <T v="hero" style={{ fontSize: 36 }}>
          {p ? usd(p.price) : '—'}
        </T>
        {p ? (
          <T v="num" color={ch >= 0 ? colors.profit : colors.loss} style={{ marginBottom: 6 }}>
            {ch >= 0 ? '▲' : '▼'} {Math.abs(ch).toFixed(2)}%
          </T>
        ) : null}
      </Row>
      <T v="small" style={{ marginTop: 4 }}>
        Prices and execution by Definitive Flash
      </T>
    </LinearGradient>
  );
}
