export const colors = {
  bg: '#07080D',
  bgElevated: '#0C0E16',
  card: '#11131C',
  cardHi: '#171A27',
  border: '#22263A',
  borderHi: '#30354D',
  text: '#F4F5FA',
  textDim: '#A0A6BE',
  textMute: '#666D88',
  primary: '#7C5CFF',
  cyan: '#3DD6FF',
  profit: '#2EE6A6',
  loss: '#FF5C7A',
  warn: '#FFB547',
  overlay: 'rgba(4,5,9,0.78)',
} as const;

export const gradients = {
  primary: ['#7C5CFF', '#5B7CFF', '#3DD6FF'] as const,
  profit: ['#2EE6A6', '#1FB8E0'] as const,
  card: ['#171A27', '#10121B'] as const,
  hero: ['rgba(124,92,255,0.35)', 'rgba(61,214,255,0.08)', 'rgba(7,8,13,0)'] as const,
};

export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  displayMed: 'SpaceGrotesk_500Medium',
  body: 'Inter_400Regular',
  bodyMed: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const space = (n: number) => n * 4;
