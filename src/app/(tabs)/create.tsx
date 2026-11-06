import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { PriceLadder, Stepper } from '@/components/Playbook';
import { useFetch } from '@/hooks/useFetch';
import { usePrice } from '@/hooks/usePrice';
import { api } from '@/lib/api';
import { MAX_CUT_PCT } from '@/lib/constants';
import { buildPlan, pct, signedUsd, usd } from '@/lib/pricing';
import { Avatar, Button, Card, Divider, KV, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, fonts, radius, space } from '@/ui/theme';
import { useWallet } from '@/wallet/WalletProvider';

const EMOJIS = ['🦊', '🐋', '🦉', '🐯', '🚀', '🦄', '🐉', '🧠'];

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <T v="label">{label}</T>
      <TextInput placeholderTextColor={colors.textMute} style={[s.input, style]} selectionColor={colors.cyan} {...rest} />
    </View>
  );
}

function ProfileForm({ address, onSaved }: { address: string; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState(EMOJIS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Animated.View entering={FadeInDown.duration(400)}>
      <T v="h1" style={{ marginTop: space(4) }}>
        Become a creator
      </T>
      <T v="body" style={{ marginTop: space(2), marginBottom: space(5) }}>
        Publish your trading rules as playbooks. Every time someone applies one, you earn your cut.
      </T>
      <Card style={{ gap: space(4) }}>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {EMOJIS.map((e) => (
            <Pressable key={e} onPress={() => setAvatar(e)} style={{ opacity: avatar === e ? 1 : 0.45 }}>
              <Avatar emoji={e} size={44} />
            </Pressable>
          ))}
        </Row>
        <Field label="Display name" value={name} onChangeText={setName} placeholder="Riya Sharma" maxLength={40} />
        <Field label="One-line bio" value={bio} onChangeText={setBio} placeholder="Scalps ETH, tight stops" maxLength={140} />
        {error ? (
          <T v="small" color={colors.loss}>
            {error}
          </T>
        ) : null}
        <Button
          title="Create profile"
          loading={busy}
          disabled={name.trim().length < 2}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await api.saveTrader({ address, name, bio, avatar });
              onSaved();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      </Card>
    </Animated.View>
  );
}

export default function Create() {
  const w = useWallet();
  const price = usePrice();
  const profile = useFetch(() => (w.address ? api.trader(w.address) : Promise.resolve(null)), [w.address]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dip, setDip] = useState(2);
  const [tp, setTp] = useState(5);
  const [sl, setSl] = useState(3);
  const [cut, setCut] = useState(0.5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo(
    () => (price ? buildPlan({ entryOffsetPct: -dip, takeProfitPct: tp, stopLossPct: sl, cutPct: cut }, price.price, 100) : null),
    [price, dip, tp, sl, cut],
  );

  if (!w.address || profile.loading) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator color={colors.cyan} style={{ marginTop: 120 }} />
      </Screen>
    );
  }
  if (!profile.data?.trader) {
    return (
      <Screen>
        <ProfileForm address={w.address} onSaved={profile.reload} />
      </Screen>
    );
  }

  const stepFor = (v: number) => (v < 1 ? 0.1 : 0.5);

  return (
    <Screen>
      <Row style={{ marginTop: space(3), gap: 12 }}>
        <Avatar emoji={profile.data.trader.avatar} size={40} />
        <View>
          <T v="label">New playbook</T>
          <T v="h3">by {profile.data.trader.name}</T>
        </View>
      </Row>

      <Card style={{ marginTop: space(5), gap: space(4) }}>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Dip Catcher" maxLength={32} />
        <Field
          label="What it does"
          value={description}
          onChangeText={setDescription}
          placeholder="Buys small dips, exits quickly."
          maxLength={200}
          multiline
          style={{ height: 76, paddingTop: 14, textAlignVertical: 'top' }}
        />
      </Card>

      <Card style={{ marginTop: space(4) }}>
        <T v="label">Rules</T>
        <Stepper
          label="Entry"
          hint={dip === 0 ? 'Buy at market right away' : 'Limit buy below the current price'}
          value={dip}
          onChange={setDip}
          step={0.5}
          min={0}
          max={15}
          format={(v) => (v === 0 ? 'Now' : pct(-v))}
          tone={colors.primary}
        />
        <Stepper label="Take profit" hint="Above the entry" value={tp} onChange={setTp} step={stepFor(tp)} min={0.1} max={50} format={(v) => pct(v)} tone={colors.profit} />
        <Stepper label="Stop-loss" hint="Required, protects followers" value={sl} onChange={setSl} step={stepFor(sl)} min={0.1} max={30} format={(v) => pct(-v)} tone={colors.loss} />
        <Stepper label="Your cut" hint="Of each applied trade" value={cut} onChange={setCut} step={0.1} min={0} max={MAX_CUT_PCT} format={(v) => `${v.toFixed(1)}%`} tone={colors.cyan} />
      </Card>

      {plan ? (
        <Card style={{ marginTop: space(4) }} glow>
          <T v="label" style={{ marginBottom: space(3) }}>
            Live preview · ETH {usd(plan.marketPrice)}
          </T>
          <PriceLadder now={plan.marketPrice} entry={plan.entryPrice} tp={plan.takeProfitPrice} sl={plan.stopLossPrice} />
          <Divider />
          <T v="small" style={{ marginBottom: 4 }}>
            When someone applies $100:
          </T>
          <KV k="They make at take profit" v={signedUsd(plan.profitAtTpUsd)} color={colors.profit} />
          <KV k="They lose at stop-loss" v={signedUsd(plan.lossAtSlUsd)} color={colors.loss} />
          <KV k="You earn" v={usd(plan.creatorFeeUsd)} color={colors.cyan} />
        </Card>
      ) : null}

      {error ? (
        <T v="small" color={colors.loss} style={{ marginTop: space(3) }}>
          {error}
        </T>
      ) : null}
      <Button
        title="Publish playbook"
        loading={busy}
        disabled={name.trim().length < 3}
        style={{ marginTop: space(5) }}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            const { template } = await api.createTemplate({
              creator: w.address!,
              name,
              description,
              entryOffsetPct: dip,
              takeProfitPct: tp,
              stopLossPct: sl,
              cutPct: cut,
            });
            setName('');
            setDescription('');
            router.push({ pathname: '/template/[id]', params: { id: template.id } });
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderHi,
    backgroundColor: colors.bgElevated,
    color: colors.text,
    paddingHorizontal: space(4),
    fontFamily: fonts.bodyMed,
    fontSize: 16,
  },
});
