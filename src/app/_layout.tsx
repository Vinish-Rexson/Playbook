import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { useFonts } from 'expo-font';
import { DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { colors } from '@/ui/theme';
import { WalletProvider } from '@/wallet/WalletProvider';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.bg, border: colors.border, primary: colors.ink, text: colors.text },
};

export default function RootLayout() {
  const [loaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <ThemeProvider value={theme}>
      <WalletProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
          <Stack.Screen name="template/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="onboarding/create" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="onboarding/import" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="wallet/secret" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="wallet/receive" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="wallet/send" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="wallet/swap" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="search" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="trader/[address]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="position/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="unlock" options={{ gestureEnabled: false }} />
        </Stack>
      </WalletProvider>
    </ThemeProvider>
  );
}
