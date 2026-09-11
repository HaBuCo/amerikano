import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette } from '@/constants/palette';

export default function SetupScreen() {
  const [names, setNames] = useState(['Oyuncu 1', 'Oyuncu 2', 'Oyuncu 3', 'Oyuncu 4']);

  function resizePlayers(count: number) {
    setNames((current) =>
      Array.from({ length: count }, (_, i) => current[i] ?? `Oyuncu ${i + 1}`),
    );
  }

  function start() {
    const cleanNames = names.map((name, index) => name.trim().replaceAll('|', '') || `Oyuncu ${index + 1}`);
    router.push({ pathname: '/game', params: { players: cleanNames.join('|'), mode: 'local' } });
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>OYUNCULAR</Text>
          <Text style={styles.title}>Masada kimler var?</Text>
          <Text style={styles.description}>Telefon her tur sıradaki oyuncuya geçecek. Elini göstermeden önce yalnız olduğundan emin ol.</Text>

          <View style={styles.counter}>
            {[3, 4, 5, 6].map((count) => (
              <Pressable
                key={count}
                onPress={() => resizePlayers(count)}
                style={[styles.countButton, names.length === count && styles.countButtonActive]}>
                <Text style={[styles.countText, names.length === count && styles.countTextActive]}>{count}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.inputs}>
            {names.map((name, index) => (
              <View key={index} style={styles.inputRow}>
                <View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View>
                <TextInput
                  accessibilityLabel={`${index + 1}. oyuncunun adı`}
                  autoCapitalize="words"
                  maxLength={18}
                  onChangeText={(value) => setNames((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))}
                  placeholder="Oyuncu adı"
                  placeholderTextColor="#809487"
                  returnKeyType="done"
                  style={styles.input}
                  value={name}
                />
              </View>
            ))}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>♠</Text>
            <View style={styles.infoCopy}>
              <Text style={styles.infoTitle}>12 el · yaklaşık 45–90 dk.</Text>
              <Text style={styles.infoText}>İki deste, 2 joker ve yaygın puanlama sistemi kullanılır.</Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.bottomBar}>
          <Pressable onPress={start} style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}>
            <Text style={styles.startText}>Masayı Kur</Text><Text style={styles.arrow}>→</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: palette.felt },
  content: { padding: 24, paddingBottom: 32 },
  eyebrow: { color: palette.gold, fontSize: 11, fontWeight: '900', letterSpacing: 2.4, marginTop: 6 },
  title: { color: palette.cream, fontSize: 31, fontWeight: '900', letterSpacing: -0.7, marginTop: 8 },
  description: { color: palette.muted, fontSize: 15, lineHeight: 22, marginTop: 9 },
  counter: { flexDirection: 'row', gap: 9, marginTop: 25 },
  countButton: { flex: 1, height: 45, borderRadius: 12, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  countButtonActive: { backgroundColor: palette.gold, borderColor: palette.gold },
  countText: { color: palette.cream, fontSize: 16, fontWeight: '800' },
  countTextActive: { color: palette.ink },
  inputs: { gap: 10, marginTop: 22 },
  inputRow: { minHeight: 56, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: 'rgba(255,255,255,0.05)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
  number: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(217,164,65,0.16)', alignItems: 'center', justifyContent: 'center' },
  numberText: { color: palette.gold, fontSize: 13, fontWeight: '900' },
  input: { flex: 1, color: palette.cream, fontSize: 16, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 10 },
  infoCard: { marginTop: 22, borderRadius: 14, padding: 16, backgroundColor: palette.feltLight, flexDirection: 'row', alignItems: 'center', gap: 13 },
  infoIcon: { color: palette.gold, fontSize: 24 },
  infoCopy: { flex: 1 },
  infoTitle: { color: palette.cream, fontSize: 14, fontWeight: '800' },
  infoText: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  bottomBar: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 14, borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.felt },
  startButton: { minHeight: 58, borderRadius: 16, backgroundColor: palette.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  startText: { color: palette.ink, fontSize: 18, fontWeight: '900' },
  arrow: { color: palette.ink, fontSize: 25 },
  pressed: { opacity: 0.8 },
});
