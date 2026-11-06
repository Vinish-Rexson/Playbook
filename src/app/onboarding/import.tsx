import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { CircleCheck, ClipboardPaste, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button, Header, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, fonts, radius, space } from '@/ui/theme';
import { parseSecret, splitWords } from '@/wallet/keys';
import { useWallet } from '@/wallet/WalletProvider';

export default function ImportWallet() {
  usePreventScreenCapture();
  const w = useWallet();
  const [text, setText] = useState('');
  const [pasted, setPasted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseSecret(text);
  const wordCount = splitWords(text).length;
  const looksHex = /^(0x)?[0-9a-fA-F]+$/.test(text.trim());

  let status: { tone: 'ok' | 'bad' | 'hint'; text: string };
  if (!text.trim()) status = { tone: 'hint', text: 'Paste a 12 or 24 word recovery phrase, or a private key.' };
  else if (parsed.ok) {
    status = {
      tone: 'ok',
      text: parsed.kind === 'mnemonic' ? `${wordCount}-word recovery phrase · first account` : 'Private key',
    };
  } else if (parsed.badWords?.length || wordCount > 24 || (looksHex && text.trim().length >= 64)) {
    status = { tone: 'bad', text: parsed.reason };
  } else status = { tone: wordCount >= 12 ? 'bad' : 'hint', text: looksHex ? 'Private keys have 64 hex characters.' : parsed.reason };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await w.importWallet(text);
      if (pasted) await Clipboard.setStringAsync('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace('/discover');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header title="Import wallet" onBack={() => router.back()} />
        <Animated.View entering={FadeInDown.duration(350)} style={{ gap: space(4) }}>
          <View style={{ gap: space(2) }}>
            <T v="h1">Recovery phrase or private key</T>
            <T v="body">Works with phrases from MetaMask, Rabby, Rainbow, Coinbase Wallet and others.</T>
          </View>

          <View>
            <TextInput
              value={text}
              onChangeText={(t) => {
                setText(t);
                setError(null);
              }}
              placeholder="word1 word2 word3 …"
              placeholderTextColor={colors.textMute}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              importantForAutofill="no"
              keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
              textAlignVertical="top"
              style={[st.input, status.tone === 'ok' && { borderColor: '#2EE6A688' }, status.tone === 'bad' && { borderColor: '#FF5C7A88' }]}
            />
            <Pressable
              hitSlop={8}
              style={st.paste}
              onPress={async () => {
                const clip = await Clipboard.getStringAsync();
                if (clip) {
                  setText(clip.trim());
                  setPasted(true);
                }
              }}>
              <ClipboardPaste size={15} color={colors.cyan} />
              <T v="small" color={colors.cyan} style={{ fontFamily: fonts.bodySemi }}>
                Paste
              </T>
            </Pressable>
          </View>

          <Row gap={8}>
            {status.tone === 'ok' ? (
              <CircleCheck size={16} color={colors.profit} />
            ) : status.tone === 'bad' ? (
              <TriangleAlert size={16} color={colors.loss} />
            ) : null}
            <T
              v="small"
              style={{ flex: 1 }}
              color={status.tone === 'ok' ? colors.profit : status.tone === 'bad' ? colors.loss : colors.textDim}>
              {status.text}
            </T>
          </Row>

          {error ? (
            <View style={st.errorBox}>
              <T v="small" color={colors.loss}>
                {error}
              </T>
            </View>
          ) : null}

          <Button title="Import wallet" disabled={!parsed.ok} loading={busy} onPress={submit} />

          <Row gap={10} style={st.note}>
            <TriangleAlert size={18} color={colors.warn} />
            <T v="small" style={{ flex: 1 }}>
              Use a dedicated trading wallet. Avoid importing the phrase of a wallet that holds your savings: any app that
              holds a key is one more place it can leak from.
            </T>
          </Row>
        </Animated.View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const st = StyleSheet.create({
  input: {
    minHeight: 150,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderHi,
    backgroundColor: colors.card,
    color: colors.text,
    padding: space(4),
    paddingBottom: space(10),
    fontFamily: fonts.bodyMed,
    fontSize: 16,
    lineHeight: 24,
  },
  paste: {
    position: 'absolute',
    right: space(3),
    bottom: space(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: '#3DD6FF14',
    borderWidth: 1,
    borderColor: '#3DD6FF40',
  },
  note: {
    alignItems: 'flex-start',
    padding: space(3),
    borderRadius: radius.md,
    backgroundColor: '#FFB54710',
    borderWidth: 1,
    borderColor: '#FFB54733',
  },
  errorBox: {
    padding: space(3),
    borderRadius: radius.md,
    backgroundColor: '#FF5C7A12',
    borderWidth: 1,
    borderColor: '#FF5C7A44',
  },
});
