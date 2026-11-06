import * as Haptics from 'expo-haptics';
import { Check, CircleDashed, X } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

import { ALL_STEP_KEYS, stepsFor, type StepKey, type StepState } from '@/lib/applyFlow';
import { NETWORKS, type Chain } from '@/lib/constants';
import { usd } from '@/lib/pricing';
import type { Application } from '@/lib/types';
import { Button, Row } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, DUR, EASE, radius, space } from '@/ui/theme';

export type StepView = Record<StepKey, { state: StepState; detail?: string }>;

export const freshSteps = (): StepView =>
  Object.fromEntries(ALL_STEP_KEYS.map((k) => [k, { state: 'pending' as StepState }])) as StepView;

function StepIcon({ state }: { state: StepState }) {
  if (state === 'active') return <ActivityIndicator size="small" color={colors.cyan} />;
  if (state === 'done')
    return (
      <Animated.View entering={ZoomIn} style={[st.icon, { backgroundColor: colors.profit }]}>
        <Check size={14} color={colors.bg} strokeWidth={3} />
      </Animated.View>
    );
  if (state === 'error')
    return (
      <View style={[st.icon, { backgroundColor: colors.loss }]}>
        <X size={14} color={colors.bg} strokeWidth={3} />
      </View>
    );
  return <CircleDashed size={20} color={state === 'skipped' ? colors.border : colors.textMute} />;
}

export function ApplySheet({
  visible,
  steps,
  error,
  result,
  templateName,
  chain,
  onClose,
  onViewPosition,
  onGetUsdc,
}: {
  visible: boolean;
  steps: StepView;
  error: string | null;
  result: Application | null;
  templateName: string;
  chain: Chain;
  onClose: () => void;
  onViewPosition: () => void;
  /** Shown when the wallet is short of USDC on Base: opens the Uniswap swap for the missing amount. */
  onGetUsdc?: () => void;
}) {
  useEffect(() => {
    if (result) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (error) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, [result, error]);

  const busy = !result && !error;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
      <View style={st.overlay}>
        <Animated.View entering={FadeInDown.duration(DUR.enter).easing(Easing.bezier(...EASE))} style={st.sheet}>
          {result ? (
            <Animated.View entering={FadeIn} style={{ alignItems: 'center', gap: space(3) }}>
              <Animated.View entering={ZoomIn.duration(DUR.enter).easing(Easing.bezier(...EASE))} style={st.bigCheck}>
                <Check size={38} color={colors.bg} strokeWidth={3} />
              </Animated.View>
              <T v="h1" style={{ textAlign: 'center' }}>
                Playbook applied
              </T>
              <T v="body" style={{ textAlign: 'center' }}>
                {templateName} is running on {usd(result.amountUsd)} of {NETWORKS[result.chain].asset} on{' '}
                {NETWORKS[result.chain].name}.{' '}
                {result.orderType === 'market' ? 'Buying now' : result.orderType === 'twap' ? 'Buying in slices over time (DCA)' : `Buying at ${usd(result.entryPrice)}`}, protected by a
                take-profit at {usd(result.takeProfitPrice)} and a stop at {usd(result.stopLossPrice)}.
              </T>
              <Button title="View position" onPress={onViewPosition} style={{ alignSelf: 'stretch', marginTop: space(2) }} />
              <Button title="Done" variant="ghost" onPress={onClose} size="md" />
            </Animated.View>
          ) : (
            <>
              <T v="label">Applying · {NETWORKS[chain].asset} on {NETWORKS[chain].name}</T>
              <T v="h2" style={{ marginTop: 4, marginBottom: space(4) }}>
                {templateName}
              </T>
              {stepsFor(chain).map((s) => {
                const v = steps[s.key];
                return (
                  <Row key={s.key} gap={12} style={st.stepRow}>
                    <View style={{ width: 24, alignItems: 'center' }}>
                      <StepIcon state={v.state} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T
                        v="bodyMed"
                        color={v.state === 'skipped' ? colors.textMute : v.state === 'pending' ? colors.textDim : colors.text}>
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
              {!busy && onGetUsdc ? <Button title="Get USDC with Uniswap" onPress={onGetUsdc} style={{ marginTop: space(4) }} /> : null}
              {!busy && <Button title="Close" variant="secondary" onPress={onClose} style={{ marginTop: onGetUsdc ? space(2) : space(4) }} />}
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
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(6),
    paddingBottom: space(10),
  },
  stepRow: { paddingVertical: 9 },
  icon: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bigCheck: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.profit,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space(2),
  },
  errorBox: {
    marginTop: space(3),
    padding: space(3),
    borderRadius: radius.md,
    backgroundColor: colors.lossSoft,
    borderWidth: 1,
    borderColor: '#F0C9CB',
  },
});
