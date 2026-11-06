import { Eye } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { T } from '@/ui/Text';
import { colors, fonts, radius, space } from '@/ui/theme';

/** Numbered recovery words in two columns, covered until the user taps to reveal. */
export function PhraseGrid({ words, hidden, onReveal }: { words: string[]; hidden: boolean; onReveal: () => void }) {
  return (
    <View style={st.wrap}>
      <View style={st.grid}>
        {words.map((w, i) => (
          <View key={i} style={st.cell}>
            <T v="small" color={colors.textMute} style={st.num}>
              {i + 1}
            </T>
            <T v="bodyMed" selectable={false}>
              {hidden ? '••••••' : w}
            </T>
          </View>
        ))}
      </View>
      {hidden ? (
        <Pressable onPress={onReveal} style={st.cover}>
          <Animated.View entering={FadeIn} style={{ alignItems: 'center', gap: space(2) }}>
            <View style={st.eye}>
              <Eye size={24} color={colors.cyan} />
            </View>
            <T v="h3">Tap to reveal</T>
            <T v="small" style={{ textAlign: 'center', maxWidth: 240 }}>
              Make sure nobody can see your screen.
            </T>
          </Animated.View>
        </Pressable>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: 'hidden' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: space(2),
    padding: space(3),
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  cell: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingVertical: 11,
    paddingHorizontal: space(3),
    borderRadius: radius.sm,
    backgroundColor: colors.cardHi,
    borderWidth: 1,
    borderColor: colors.border,
  },
  num: { width: 18, fontFamily: fonts.bodySemi },
  cover: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(244,244,239,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderHi,
  },
  eye: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.cardHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
