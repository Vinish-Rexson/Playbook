import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Check, EyeOff, KeyRound, PenLine } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button, Card, Header, Row, Screen } from '@/ui/primitives';
import { T } from '@/ui/Text';
import { colors, radius, space } from '@/ui/theme';
import { newMnemonic, WORDLIST } from '@/wallet/keys';
import { PhraseGrid } from '@/wallet/PhraseGrid';
import { useWallet } from '@/wallet/WalletProvider';

const RULES = [
  { icon: KeyRound, title: 'Your 12 words are the wallet', text: 'They are the only way to restore it on a new phone.' },
  { icon: PenLine, title: 'Write them on paper', text: 'Keep them offline. No screenshots, notes apps or cloud.' },
  { icon: EyeOff, title: 'Never share them', text: 'Anyone with the words controls your funds. Playbook will never ask.' },
];

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

type Quiz = { index: number; options: string[] }[];

function makeQuiz(words: string[]): Quiz {
  const picks = shuffle(words.map((_, i) => i)).slice(0, 3).sort((a, b) => a - b);
  return picks.map((index) => {
    const decoys = new Set<string>();
    while (decoys.size < 2) {
      const d = WORDLIST[Math.floor(Math.random() * WORDLIST.length)];
      if (!words.includes(d)) decoys.add(d);
    }
    return { index, options: shuffle([words[index], ...decoys]) };
  });
}

export default function CreateWallet() {
  usePreventScreenCapture();
  const w = useWallet();
  const [mnemonic] = useState(newMnemonic);
  const words = mnemonic.split(' ');
  const [quiz] = useState(() => makeQuiz(words));
  const [step, setStep] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [wrong, setWrong] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const allCorrect = quiz.every((q) => answers[q.index] === words[q.index]);

  const finish = async (backedUp: boolean) => {
    setBusy(true);
    try {
      await w.createWallet(mnemonic, backedUp);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace('/discover');
    } catch (e) {
      Alert.alert('Could not create wallet', e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const pick = (index: number, word: string) => {
    if (word === words[index]) {
      Haptics.selectionAsync().catch(() => {});
      setAnswers((a) => ({ ...a, [index]: word }));
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setWrong(`${index}:${word}`);
      setTimeout(() => setWrong(null), 700);
    }
  };

  return (
    <Screen>
      <Header
        title="New wallet"
        step={{ at: step, of: 3 }}
        onBack={() => (step > 0 ? setStep(step - 1) : router.back())}
      />

      {step === 0 ? (
        <Animated.View key="intro" entering={FadeInDown.duration(350)} style={{ gap: space(4) }}>
          <T v="h1">Before you see your recovery phrase</T>
          <View style={{ gap: space(3) }}>
            {RULES.map(({ icon: Icon, title, text }) => (
              <Card key={title}>
                <Row gap={14} style={{ alignItems: 'flex-start' }}>
                  <View style={st.ruleIcon}>
                    <Icon size={20} color={colors.cyan} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="h3">{title}</T>
                    <T v="small">{text}</T>
                  </View>
                </Row>
              </Card>
            ))}
          </View>
          <Pressable onPress={() => setAgreed((v) => !v)} style={st.agree}>
            <View style={[st.box, agreed && st.boxOn]}>{agreed ? <Check size={14} color={colors.bg} strokeWidth={3} /> : null}</View>
            <T v="bodyMed" style={{ flex: 1 }}>
              I understand that if I lose these words, Playbook cannot recover my wallet.
            </T>
          </Pressable>
          <Button title="Show my recovery phrase" disabled={!agreed} onPress={() => setStep(1)} />
        </Animated.View>
      ) : null}

      {step === 1 ? (
        <Animated.View key="phrase" entering={FadeInDown.duration(350)} style={{ gap: space(4) }}>
          <View style={{ gap: space(2) }}>
            <T v="h1">Your recovery phrase</T>
            <T v="body">Write these 12 words down in order and keep them somewhere safe.</T>
          </View>
          <PhraseGrid words={words} hidden={!revealed} onReveal={() => setRevealed(true)} />
          <Button title="I wrote it down" disabled={!revealed} onPress={() => setStep(2)} />
          <Button
            title="Back up later"
            variant="ghost"
            size="md"
            loading={busy}
            onPress={() =>
              Alert.alert(
                'Skip the backup?',
                'Until you back up your recovery phrase, losing this phone means losing the funds in this wallet. You can back up any time from Profile.',
                [
                  { text: 'Go back', style: 'cancel' },
                  { text: 'Skip for now', style: 'destructive', onPress: () => finish(false) },
                ],
              )
            }
          />
        </Animated.View>
      ) : null}

      {step === 2 ? (
        <Animated.View key="verify" entering={FadeInDown.duration(350)} style={{ gap: space(4) }}>
          <View style={{ gap: space(2) }}>
            <T v="h1">Confirm your backup</T>
            <T v="body">Tap the right word for each position.</T>
          </View>
          {quiz.map((q) => {
            const done = answers[q.index] === words[q.index];
            return (
              <Card key={q.index} style={{ gap: space(3) }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T v="label">Word #{q.index + 1}</T>
                  {done ? (
                    <Animated.View entering={FadeIn}>
                      <Check size={18} color={colors.profit} strokeWidth={3} />
                    </Animated.View>
                  ) : null}
                </Row>
                <Row gap={8}>
                  {q.options.map((opt) => {
                    const chosen = answers[q.index] === opt;
                    const bad = wrong === `${q.index}:${opt}`;
                    return (
                      <Pressable
                        key={opt}
                        disabled={done}
                        onPress={() => pick(q.index, opt)}
                        style={[st.opt, chosen && st.optRight, bad && st.optWrong]}>
                        <T v="bodyMed" color={chosen ? colors.profit : bad ? colors.loss : colors.text}>
                          {opt}
                        </T>
                      </Pressable>
                    );
                  })}
                </Row>
              </Card>
            );
          })}
          <Button title="Create wallet" disabled={!allCorrect} loading={busy} onPress={() => finish(true)} />
        </Animated.View>
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  ruleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#3DD6FF14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  agree: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    padding: space(4),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.borderHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  opt: {
    flex: 1,
    height: 46,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderHi,
    backgroundColor: colors.cardHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optRight: { borderColor: '#2EE6A688', backgroundColor: '#2EE6A614' },
  optWrong: { borderColor: '#FF5C7A88', backgroundColor: '#FF5C7A14' },
});
