// Bottom sheet that shows a multi-step wallet flow (e.g. closing a position): one row per step, then a result.
import * as Haptics from 'expo-haptics';
import { Check, CircleDashed, X } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

import { Button, Row } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, DUR, EASE, radius, space } from '@/ui/theme';

export type StepRowState = 'pending' | 'active' | 'done' | 'skipped' | 'error';

function StepIcon({ state }: { state: StepRowState }) {
  if (state === 'active') return <ActivityIndicator size="small" color={colors.ink} />;
  if (state === 'done')
    return (
      <Animated.View entering={ZoomIn.duration(DUR.menu)} style={[st.icon, { backgroundColor: colors.profit }]}>
        <Check size={13} color={colors.onInk} strokeWidth={3} />
      </Animated.View>
    );
  if (state === 'error')
    return (
      <View style={[st.icon, { backgroundColor: colors.loss }]}>
        <X size={13} color={colors.onInk} strokeWidth={3} />
      </View>
    );
  return <CircleDashed size={20} strokeWidth={1.75} color={state === 'skipped' ? colors.borderHi : colors.textMute} />;
}

export function StepsSheet<K extends string>({
  visible,
  kicker,
  title,
  steps,
  view,
  error,
  done,
  onClose,
}: {
  visible: boolean;
  kicker: string;
  title: string;
  steps: { key: K; label: string }[];
  view: Record<K, { state: StepRowState; detail?: string }>;
  error: string | null;
  done: { title: string; body: string } | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (done) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (error) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, [done, error]);
  const busy = !done && !error;
  const ease = Easing.bezier(...EASE);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
      <View style={st.overlay}>
        <Animated.View entering={FadeInDown.duration(DUR.enter).easing(ease)} style={st.sheet}>
          {done ? (
            <Animated.View entering={FadeIn.duration(DUR.menu)} style={{ alignItems: 'center', gap: space(3) }}>
              <Animated.View entering={ZoomIn.duration(DUR.enter).easing(ease)} style={st.bigCheck}>
                <Check size={30} color={colors.ink} strokeWidth={2.5} />
              </Animated.View>
              <T v="h1" style={{ textAlign: 'center' }}>
                {done.title}
              </T>
              <T v="body" style={{ textAlign: 'center' }}>
                {done.body}
              </T>
              <Button title="Done" onPress={onClose} style={{ alignSelf: 'stretch', marginTop: space(2) }} />
            </Animated.View>
          ) : (
            <>
              <T v="small">{kicker}</T>
              <T v="h2" style={{ marginTop: 4, marginBottom: space(4) }}>
                {title}
              </T>
              {steps.map((s) => {
                const v = view[s.key];
                return (
                  <Row key={s.key} gap={12} style={{ minHeight: 44 }}>
                    <View style={{ width: 24, alignItems: 'center' }}>
                      <StepIcon state={v.state} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T v="bodyMed" color={v.state === 'skipped' ? colors.textMute : v.state === 'pending' ? colors.textDim : colors.text}>
                        {s.label}
                      </T>
                      {v.detail ? <T v="small">{v.detail}</T> : null}
                    </View>
                  </Row>
                );
              })}
              {error ? (
                <View style={st.errorBox}>
                  <T v="small" color={colors.loss}>
                    {error}
                  </T>
                </View>
              ) : null}
              {!busy && <Button title="Close" variant="secondary" onPress={onClose} style={{ marginTop: space(4) }} />}
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space(6),
    paddingBottom: space(10),
  },
  icon: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bigCheck: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space(2),
  },
  errorBox: { marginTop: space(3), padding: space(3), borderRadius: radius.sm, backgroundColor: colors.lossSoft },
});
