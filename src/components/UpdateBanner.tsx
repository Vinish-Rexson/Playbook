// "Update available" for APKs installed from a shared link (no Play Store to update them).
// `npm run release` publishes latest.json next to the APK; this compares its versionCode with the one
// built into this app and, when newer, offers to download the new APK (Android installs it over this one).
import Constants from 'expo-constants';
import { ArrowDownToLine, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { T } from '@/ui/Text';
import { colors, DUR, EASE, radius, space } from '@/ui/theme';

type Latest = { version: string; versionCode: number; url: string; notes?: string; sizeMb?: number };

const FEED: string | undefined = Constants.expoConfig?.extra?.releaseFeed;
const CURRENT = Constants.expoConfig?.android?.versionCode ?? 0;
// Development builds run from the dev server, so they never need an APK update.
const ENABLED = Platform.OS === 'android' && !__DEV__ && !!FEED;

export function UpdateBanner() {
  const [latest, setLatest] = useState<Latest | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!ENABLED) return;
    let alive = true;
    fetch(`${FEED}?t=${Math.floor(Date.now() / 60_000)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Latest | null) => {
        if (alive && j && j.versionCode > CURRENT && /^https:\/\//.test(j.url)) setLatest(j);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!latest || hidden) return null;
  return (
    <Animated.View entering={FadeInDown.duration(DUR.enter).easing(Easing.bezier(...EASE))} style={{ marginBottom: space(4) }}>
      <Pressable
        onPress={() => Linking.openURL(latest.url)}
        accessibilityRole="button"
        accessibilityLabel={`Download Playbook ${latest.version}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space(3),
          backgroundColor: colors.ink,
          borderRadius: radius.md,
          paddingVertical: space(3),
          paddingLeft: space(4),
          paddingRight: space(2),
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}>
        <View style={{ width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowDownToLine size={16} strokeWidth={2} color={colors.ink} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="bodyMed" color={colors.onInk}>
            Update available · {latest.version}
          </T>
          <T v="small" color={colors.textMute} numberOfLines={2}>
            {latest.notes ? latest.notes : 'Tap to download, then open the file to install.'}
            {latest.sizeMb ? ` ${latest.sizeMb} MB.` : ''}
          </T>
        </View>
        <Pressable onPress={() => setHidden(true)} hitSlop={10} accessibilityLabel="Hide update" style={{ padding: space(2) }}>
          <X size={16} strokeWidth={1.75} color={colors.textMute} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}
