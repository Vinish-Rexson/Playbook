import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, fonts } from './theme';

type Variant = 'hero' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyMed' | 'small' | 'label' | 'num' | 'numLg';

const styles: Record<Variant, TextStyle> = {
  hero: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -1 },
  h1: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  h2: { fontFamily: fonts.display, fontSize: 21, lineHeight: 26, letterSpacing: -0.3 },
  h3: { fontFamily: fonts.displayMed, fontSize: 16, lineHeight: 21 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyMed: { fontFamily: fonts.bodyMed, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.bodySemi, fontSize: 11, lineHeight: 14, letterSpacing: 1.1, textTransform: 'uppercase' },
  num: { fontFamily: fonts.displayMed, fontSize: 16, lineHeight: 20, fontVariant: ['tabular-nums'] },
  numLg: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
};

const defaultColor: Record<Variant, string> = {
  hero: colors.text, h1: colors.text, h2: colors.text, h3: colors.text, body: colors.textDim,
  bodyMed: colors.text, small: colors.textDim, label: colors.textMute, num: colors.text, numLg: colors.text,
};

export function T({ v = 'body', color, style, ...rest }: TextProps & { v?: Variant; color?: string }) {
  return <Text {...rest} style={[styles[v], { color: color ?? defaultColor[v] }, style]} />;
}
