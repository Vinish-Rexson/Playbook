import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, fonts } from './theme';

type Variant = 'hero' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyMed' | 'small' | 'label' | 'num' | 'numLg' | 'mono';

// Hierarchy from size and color; weights 400–600; sentence case; tabular figures for numbers.
const styles: Record<Variant, TextStyle> = {
  hero: { fontFamily: fonts.display, fontSize: 38, lineHeight: 44, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  h1: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  h2: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  h3: { fontFamily: fonts.display, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyMed: { fontFamily: fonts.bodyMed, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.bodyMed, fontSize: 13, lineHeight: 18 },
  num: { fontFamily: fonts.display, fontSize: 16, lineHeight: 20, fontVariant: ['tabular-nums'] },
  numLg: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  mono: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
};

const defaultColor: Record<Variant, string> = {
  hero: colors.text,
  h1: colors.text,
  h2: colors.text,
  h3: colors.text,
  body: colors.textDim,
  bodyMed: colors.text,
  small: colors.textDim,
  label: colors.textDim,
  num: colors.text,
  numLg: colors.text,
  mono: colors.textDim,
};

export function T({ v = 'body', color, style, ...rest }: TextProps & { v?: Variant; color?: string }) {
  return <Text {...rest} style={[styles[v], { color: color ?? defaultColor[v] }, style]} />;
}
