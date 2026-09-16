import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette as p } from '@/constants/palette';

const steps = [
  {
    symbol: '♠  ♥  ♦  ♣',
    title: 'En düşük puan kazanır',
    body: 'Amerikano 12 el sürer. Her elde farklı bir açılış görevi vardır. Elinde kalan kartlar ceza puanı olur.',
  },
  {
    symbol: 'DESTE  →  ELİN',
    title: 'Kartı tut, eline sürükle',
    body: 'Sıran “Kart çek” aşamasındaysa kapalı desteyi veya açık kartı tutup elinin üzerine bırak.',
  },
  {
    symbol: 'KÜT  ·  SERİ  ·  JOKER',
    title: 'Görev tepsilerini doldur',
    body: 'Uygun kartları görev tepsilerine sürükle. Elini açtıktan sonraki sıralarda masadaki gruplara kart işleyebilirsin. İlk 5 elin açılışında joker kullanılamaz.',
  },
  {
    symbol: 'ELİN  →  AÇIK KART',
    title: 'Son olarak bir kart at',
    body: 'Hamleni bitirmek için elindeki kartı açık kart alanına sürükle. “Oto diz” iyi grupları öne getirir; “Elle diz” sıralamayı sana bırakır.',
  },
];

export function GameTutorial({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const finish = () => {
    setStep(0);
    onDone();
  };

  return <Modal visible={visible} animationType="fade" onRequestClose={finish}>
    <SafeAreaView style={s.page}>
      <View style={s.topRow}>
        <Text style={s.eyebrow}>İLK OYUN REHBERİ</Text>
        <Pressable accessibilityRole="button" onPress={finish}><Text style={s.skip}>Geç</Text></Pressable>
      </View>
      <View style={s.progress}>{steps.map((_, index) => <View key={index} style={[s.progressItem, index <= step && s.progressActive]} />)}</View>
      <View style={s.card}>
        <Text style={s.counter}>{step + 1} / {steps.length}</Text>
        <View style={s.symbolBox}><Text style={s.symbol}>{current.symbol}</Text></View>
        <Text style={s.title}>{current.title}</Text>
        <Text style={s.body}>{current.body}</Text>
      </View>
      <View style={s.actions}>
        {step > 0 && <Pressable accessibilityRole="button" style={s.secondary} onPress={() => setStep((value) => value - 1)}><Text style={s.secondaryText}>Geri</Text></Pressable>}
        <Pressable accessibilityRole="button" style={s.primary} onPress={() => step === steps.length - 1 ? finish() : setStep((value) => value + 1)}>
          <Text style={s.primaryText}>{step === steps.length - 1 ? 'Oyuna başla' : 'Devam'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.felt, padding: 24, justifyContent: 'space-between' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: p.gold, fontSize: 11, letterSpacing: 2.5, fontWeight: '800' }, skip: { color: p.cream, fontSize: 14, padding: 8 },
  progress: { flexDirection: 'row', gap: 7, marginTop: 16 }, progressItem: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#ffffff24' }, progressActive: { backgroundColor: p.gold },
  card: { flex: 1, justifyContent: 'center', gap: 18, width: '100%', maxWidth: 500, alignSelf: 'center' },
  counter: { color: p.muted, fontSize: 12, fontWeight: '700' },
  symbolBox: { minHeight: 120, borderRadius: 22, borderWidth: 1, borderColor: p.line, backgroundColor: '#ffffff08', alignItems: 'center', justifyContent: 'center', padding: 20 },
  symbol: { color: p.gold, fontSize: 25, fontWeight: '900', textAlign: 'center' },
  title: { color: p.cream, fontSize: 31, lineHeight: 37, fontWeight: '900' }, body: { color: p.muted, fontSize: 17, lineHeight: 26 },
  actions: { flexDirection: 'row', gap: 10, width: '100%', maxWidth: 500, alignSelf: 'center' },
  primary: { flex: 2, minHeight: 56, borderRadius: 14, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: p.ink, fontSize: 16, fontWeight: '900' },
  secondary: { flex: 1, minHeight: 56, borderRadius: 14, borderWidth: 1, borderColor: p.line, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: p.cream, fontSize: 15, fontWeight: '800' },
});
