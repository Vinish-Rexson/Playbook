// Find creators by name or handle, then open their profile and playbooks.
import { router } from 'expo-router';
import { ChevronRight, Search as SearchIcon, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { useFetch } from '@/hooks/useFetch';
import { api } from '@/lib/api';
import type { TraderSummary } from '@/lib/types';
import { Avatar, Card, Header, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, DUR, EASE, fonts, radius, space } from '@/ui/theme';

const winRate = (t: Pick<TraderSummary, 'wins' | 'losses'>) =>
  t.wins + t.losses ? `${Math.round((100 * t.wins) / (t.wins + t.losses))}% wins` : 'no closed trades';

function TraderRow({ t, first }: { t: TraderSummary; first?: boolean }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/trader/[address]', params: { address: t.address } })}
      style={({ pressed }) => [st.row, !first && st.line, pressed && { opacity: 0.6 }]}
      accessibilityRole="button">
      <Avatar name={t.name} tone={t.avatar} size={40} />
      <View style={{ flex: 1 }}>
        <T v="bodyMed" numberOfLines={1}>
          {t.name}
        </T>
        <T v="mono" numberOfLines={1}>
          @{t.handle} · {t.playbooks} {t.playbooks === 1 ? 'playbook' : 'playbooks'}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T v="num" style={{ fontSize: 15 }}>
          {t.applies}
        </T>
        <T v="mono">{t.applies ? winRate(t) : 'applies'}</T>
      </View>
      <ChevronRight size={18} strokeWidth={1.75} color={colors.textMute} />
    </Pressable>
  );
}

export default function SearchCreators() {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  // Search after a short pause in typing.
  useEffect(() => {
    const id = setTimeout(() => setQ(input.trim()), 250);
    return () => clearTimeout(id);
  }, [input]);
  const { data, loading, error } = useFetch(() => api.traders(q), [q]);

  return (
    <Screen>
      <Header title="Creators" onBack={() => router.back()} />
      <Row style={st.search} gap={10}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Name or @handle"
          placeholderTextColor={colors.textMute}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          style={st.input}
          selectionColor={colors.ink}
          accessibilityLabel="Search creators"
        />
        {input ? (
          <Pressable onPress={() => setInput('')} hitSlop={8} accessibilityLabel="Clear">
            <X size={18} strokeWidth={1.75} color={colors.textDim} />
          </Pressable>
        ) : null}
        <View style={st.searchBtn}>
          <SearchIcon size={18} strokeWidth={1.75} color={colors.onInk} />
        </View>
      </Row>

      <T v="small" style={{ marginTop: space(5), marginBottom: space(2) }}>
        {q ? `Results for “${q}”` : 'Most applied creators'}
      </T>
      {loading && !data ? <ActivityIndicator color={colors.textDim} style={{ marginTop: space(6) }} /> : null}
      {error && !data ? (
        <T v="small" color={colors.loss}>
          {error}
        </T>
      ) : null}
      {data ? (
        data.traders.length ? (
          <Animated.View entering={FadeInDown.duration(DUR.enter).easing(Easing.bezier(...EASE))}>
            <Card style={{ paddingVertical: space(1) }}>
              {data.traders.map((t, i) => (
                <TraderRow key={t.address} t={t} first={i === 0} />
              ))}
            </Card>
          </Animated.View>
        ) : (
          <Card style={{ alignItems: 'center', paddingVertical: space(8), gap: space(2) }}>
            <T v="h3">No creators found</T>
            <T v="small">Try a different name or handle</T>
          </Card>
        )
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  search: {
    height: 52,
    paddingLeft: space(5),
    paddingRight: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderHi,
  },
  input: { flex: 1, color: colors.text, fontFamily: fonts.bodyMed, fontSize: 15, paddingVertical: 0 },
  searchBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 64 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderHi },
});
