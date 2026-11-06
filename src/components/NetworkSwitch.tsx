// Segmented Base / Solana control (creating, applying, wallet).
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { CHAINS, NETWORKS, type Chain } from '@/lib/constants';
import { T } from '@/ui/Text';
import { colors, radius } from '@/ui/theme';

export const NETWORK_DOT: Record<Chain, string> = { base: '#3D7BFF', solana: '#14F195' };

type Option<V extends string> = { value: V; label: string; dots: Chain[] };

function Segmented<V extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Option<V>[];
  value: V;
  onChange: (v: V) => void;
  disabled?: V[];
}) {
  return (
    <View style={st.wrap}>
      {options.map((o) => {
        const on = o.value === value;
        const off = disabled?.includes(o.value);
        return (
          <Pressable
            key={o.value}
            disabled={off}
            onPress={() => {
              if (on) return;
              Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            style={[st.seg, on && st.segOn, off && { opacity: 0.4 }]}>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {o.dots.map((c) => (
                <View key={c} style={[st.dot, { backgroundColor: NETWORK_DOT[c] }]} />
              ))}
            </View>
            <T v="bodyMed" color={on ? colors.text : colors.textDim}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Base / Solana. */
export function NetworkSwitch({
  value,
  onChange,
  disabled,
  showAsset = true,
}: {
  value: Chain;
  onChange: (c: Chain) => void;
  /** Networks that can't be picked (e.g. Solana for a private-key wallet). */
  disabled?: Chain[];
  /** "ETH · Base" instead of just "Base". */
  showAsset?: boolean;
}) {
  const options = CHAINS.map((c) => ({
    value: c,
    label: showAsset ? `${NETWORKS[c].asset} · ${NETWORKS[c].name}` : NETWORKS[c].name,
    dots: [c],
  }));
  return <Segmented options={options} value={value} onChange={onChange} disabled={disabled} />;
}

const st = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radius.md,
    backgroundColor: colors.cardHi,
    borderWidth: 1,
    borderColor: colors.border,
  },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 9,
    borderRadius: radius.md - 4,
  },
  segOn: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderHi },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
