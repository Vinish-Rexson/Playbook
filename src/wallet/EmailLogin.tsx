// Email + one-time-code login. Only rendered when Privy is configured (needs PrivyProvider above it).
import { useLoginWithEmail } from '@privy-io/expo';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Button } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, fonts, radius, space } from '@/ui/theme';

export function EmailLogin() {
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!sent ? (
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@email.com"
          placeholderTextColor={colors.textMute}
          inputMode="email"
          autoCapitalize="none"
          autoComplete="email"
          style={s.input}
        />
      ) : (
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="6-digit code"
          placeholderTextColor={colors.textMute}
          inputMode="numeric"
          maxLength={6}
          style={[s.input, { letterSpacing: 6, textAlign: 'center' }]}
        />
      )}
      {error ? (
        <T v="small" color={colors.loss}>
          {error}
        </T>
      ) : null}
      {!sent ? (
        <Button
          title="Continue with email"
          loading={busy}
          disabled={!/\S+@\S+\.\S+/.test(email)}
          onPress={() => go(async () => {
            await sendCode({ email: email.trim() });
            setSent(true);
          })}
        />
      ) : (
        <>
          <Button
            title="Verify & create wallet"
            loading={busy}
            disabled={code.length < 6}
            onPress={() => go(() => loginWithCode({ code, email: email.trim() }))}
          />
          <T v="small" style={{ textAlign: 'center' }} onPress={() => setSent(false)}>
            Code sent to {email}. Tap to change.
          </T>
        </>
      )}
    </>
  );
}

const s = StyleSheet.create({
  input: {
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderHi,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: space(4),
    fontFamily: fonts.bodyMed,
    fontSize: 16,
  },
});
