// The wallet's own confirmation step: every transaction and signature is shown here before the key is used.
import * as Haptics from 'expo-haptics';
import { MessageSquareText, PenLine, ShieldCheck, TriangleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { formatEther, type Address } from 'viem';

import { usePrice } from '@/hooks/usePrice';
import { publicClient } from '@/lib/chain';
import { shortAddr, usd } from '@/lib/pricing';
import { Button, Divider, KV, Row } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, radius, space } from '@/ui/theme';

import { describe, type SignRequest } from './describe';

type Fee = { eth: number; enough: boolean } | { error: string };

function useNetworkFee(req: SignRequest, from: Address) {
  const [fee, setFee] = useState<Fee | null>(null);
  useEffect(() => {
    if (req.kind !== 'transaction') return;
    let off = false;
    (async () => {
      try {
        const [gas, fees, balance] = await Promise.all([
          publicClient.estimateGas({ account: from, to: req.to, data: req.data }),
          publicClient.estimateFeesPerGas(),
          publicClient.getBalance({ address: from }),
        ]);
        const wei = gas * (fees.maxFeePerGas ?? 0n);
        if (!off) setFee({ eth: Number(formatEther(wei)), enough: balance >= wei });
      } catch {
        if (!off) setFee({ error: 'Could not estimate the network fee.' });
      }
    })();
    return () => {
      off = true;
    };
  }, [req, from]);
  return fee;
}

function SignBody({
  req,
  from,
  onApprove,
  onReject,
}: {
  req: SignRequest;
  from: Address;
  onApprove: () => void;
  onReject: () => void;
}) {
  const d = describe(req);
  const fee = useNetworkFee(req, from);
  const price = usePrice();
  const Icon = d.icon === 'approve' ? ShieldCheck : d.icon === 'sign' ? PenLine : MessageSquareText;
  const noGas = fee && 'enough' in fee && !fee.enough;

  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={st.sheet}>
      <View style={st.handle} />
      <Row gap={12}>
        <View style={st.iconWrap}>
          <Icon size={22} color={colors.cyan} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="label">{d.label}</T>
          <T v="h2" style={{ marginTop: 2 }}>
            {d.title}
          </T>
        </View>
      </Row>
      <T v="body" style={{ marginTop: space(3) }}>
        {d.subtitle}
      </T>

      {d.rows.length || req.kind !== 'typedData' ? (
        <View style={st.details}>
          {d.rows.map((r) => (
            <KV key={r.k} k={r.k} v={r.v} />
          ))}
          {req.kind === 'transaction' ? (
            <>
              {d.rows.length ? <Divider /> : null}
              <KV
                k="Network fee"
                v={
                  !fee
                    ? 'Estimating…'
                    : 'error' in fee
                      ? 'Unknown'
                      : `${fee.eth.toFixed(6)} ETH${price ? ` · ${usd(fee.eth * price.price)}` : ''}`
                }
                color={noGas ? colors.loss : undefined}
              />
            </>
          ) : null}
          {req.kind === 'message' ? (
            <ScrollView style={{ maxHeight: 140 }}>
              <T v="bodyMed" style={{ fontFamily: 'Inter_400Regular' }}>
                {req.message}
              </T>
            </ScrollView>
          ) : null}
        </View>
      ) : null}

      {d.warning || noGas || (fee && 'error' in fee) ? (
        <Row gap={10} style={st.warn}>
          <TriangleAlert size={18} color={colors.warn} />
          <T v="small" color={colors.warn} style={{ flex: 1 }}>
            {noGas
              ? 'Not enough ETH on Base for the network fee. Add a little ETH to this wallet first.'
              : d.warning ?? (fee && 'error' in fee ? `${fee.error} The transaction may fail.` : '')}
          </T>
        </Row>
      ) : null}

      <Row gap={12} style={{ marginTop: space(5) }}>
        <Button title="Reject" variant="secondary" onPress={onReject} style={{ flex: 1 }} />
        <Button
          title={req.kind === 'transaction' ? 'Confirm' : 'Sign'}
          onPress={onApprove}
          disabled={!!noGas}
          style={{ flex: 1 }}
        />
      </Row>
      <T v="small" color={colors.textMute} style={{ textAlign: 'center', marginTop: space(3) }}>
        Signed on this phone by your wallet {shortAddr(from)}
      </T>
    </Animated.View>
  );
}

export function SignSheet({
  request,
  from,
  onApprove,
  onReject,
}: {
  request: { id: number; req: SignRequest } | null;
  from: Address | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  useEffect(() => {
    if (request) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [request]);

  return (
    <Modal visible={!!request && !!from} transparent animationType="fade" onRequestClose={onReject}>
      <View style={st.overlay}>
        {request && from ? (
          <SignBody key={request.id} req={request.req} from={from} onApprove={onApprove} onReject={onReject} />
        ) : null}
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
    borderColor: colors.borderHi,
    padding: space(6),
    paddingTop: space(3),
    paddingBottom: space(9),
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderHi,
    marginBottom: space(5),
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#3DD6FF14',
    borderWidth: 1,
    borderColor: '#3DD6FF40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {
    marginTop: space(4),
    padding: space(4),
    paddingVertical: space(2),
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  warn: {
    marginTop: space(3),
    padding: space(3),
    borderRadius: radius.md,
    backgroundColor: '#FFB54712',
    borderWidth: 1,
    borderColor: '#FFB54744',
  },
});
