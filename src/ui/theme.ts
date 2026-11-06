// Playbook design tokens.
//
// Direction
//   Product    copy-trading playbooks with a built-in wallet, on Base and Solana
//   Character  graphic, decisive, ink-on-paper
//   World      a printed trading slip: warm paper, black ink, one highlighter
//   Moments    the market chart and the wallet card
//   Signature  ticket cards with a black header strip; lime used like a highlighter, sparingly
//
// One neutral ramp (warm paper → ink), three text roles, one accent (lime, always with ink text on it),
// toned semantic colors, hairline borders, no gradients or glows.
export const colors = {
  // Surfaces
  bg: '#F4F4EF',
  bgElevated: '#FFFFFF',
  card: '#FFFFFF',
  cardHi: '#EEEEE8',
  border: '#E4E4DD',
  borderHi: '#D3D3CB',
  // Text roles
  text: '#111113',
  textDim: '#5E5E66',
  textMute: '#9A9AA2',
  // Ink and accent
  ink: '#111113',
  onInk: '#FFFFFF',
  accent: '#D6F33C',
  accentSoft: '#F2FAD0',
  // Semantic (toned for a light surface)
  profit: '#11935E',
  profitSoft: '#E3F4EB',
  loss: '#D93B42',
  lossSoft: '#FBE8E8',
  warn: '#A86A12',
  warnSoft: '#FAF0DC',
  overlay: 'rgba(17,17,19,0.42)',
  // Legacy names kept so older call sites stay valid: both mean "ink".
  primary: '#111113',
  cyan: '#111113',
} as const;

export const fonts = {
  display: 'PlusJakartaSans_600SemiBold',
  displayMed: 'PlusJakartaSans_500Medium',
  body: 'PlusJakartaSans_400Regular',
  bodyMed: 'PlusJakartaSans_500Medium',
  bodySemi: 'PlusJakartaSans_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoMed: 'JetBrainsMono_500Medium',
} as const;

/** Controls 10, cards 16, sheets 24; pills only for primary buttons, tab bar and tags. */
export const radius = { sm: 10, md: 16, lg: 20, xl: 24, pill: 999 } as const;
/** 4px grid. */
export const space = (n: number) => n * 4;

/** One easing curve for every transition (unslop motion rules). */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const DUR = { fast: 160, menu: 200, enter: 360 } as const;
