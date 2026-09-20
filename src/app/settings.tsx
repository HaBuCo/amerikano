import { useState } from 'react';
import { router, Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGameSounds } from '@/audio/game-sounds';
import { AuthPanel } from '@/components/auth-panel';
import { DELETE_ACCOUNT_URL, PRIVACY_POLICY_URL, TERMS_LABEL, TERMS_URL } from '@/constants/legal';
import { palette as p } from '@/constants/palette';
import { useAuth } from '@/network/auth';
import { useGameSettings } from '@/settings/game-settings';

function SettingRow({ label, detail, value, onPress }: { label: string; detail: string; value: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={onPress} style={s.row}>
    <View style={s.rowCopy}><Text style={s.rowTitle}>{label}</Text><Text style={s.rowDetail}>{detail}</Text></View>
    <View style={[s.switchTrack, value && s.switchTrackOn]}><View style={[s.switchKnob, value && s.switchKnobOn]} /></View>
  </Pressable>;
}

function LinkRow({ label, detail, url }: { label: string; detail: string; url: string }) {
  return <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(url)} style={s.row}>
    <View style={s.rowCopy}><Text style={s.rowTitle}>{label}</Text><Text style={s.rowDetail}>{detail}</Text></View>
    <Text style={s.openText}>Aç</Text>
  </Pressable>;
}

export default function SettingsScreen() {
  const auth = useAuth();
  const { enabled: soundEnabled, toggle: toggleSound } = useGameSounds();
  const { settings, updateSettings, feedback } = useGameSettings();
  const [accountOpen, setAccountOpen] = useState(false);

  return <SafeAreaView style={s.page}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.backButton}><Text style={s.backText}>Geri</Text></Pressable>
      <Text style={s.eyebrow}>AYARLAR</Text>
      <Text style={s.title}>Oyun sana uysun.</Text>
      <Text style={s.body}>Ses, titreşim, oyun yardımları, hesap ve yasal belgeler tek yerde.</Text>

      <Text style={s.sectionTitle}>OYUN</Text>
      <View style={s.card}>
        <SettingRow label="Ses efektleri" detail="Kart ve masa seslerini açar." value={soundEnabled} onPress={() => { toggleSound(); feedback(); }} />
        <SettingRow label="Titreşim" detail="Dokunuşlarda geri bildirim verir." value={settings.haptics} onPress={() => updateSettings({ haptics: !settings.haptics })} />
        <SettingRow label="Süre uyarısı" detail="Son 10 saniyede uyarır." value={settings.criticalTimer} onPress={() => { feedback(); updateSettings({ criticalTimer: !settings.criticalTimer }); }} />
        <SettingRow label="Küçük kartlar" detail="Kalabalık elleri daha sıkı gösterir." value={settings.compactCards} onPress={() => { feedback(); updateSettings({ compactCards: !settings.compactCards }); }} />
        <SettingRow label="Sürükleme ipuçları" detail="Uygun bırakma alanlarını vurgular." value={settings.dragHints} onPress={() => { feedback(); updateSettings({ dragHints: !settings.dragHints }); }} />
      </View>

      <Text style={s.sectionTitle}>HESAP</Text>
      <View style={s.accountCard}>
        <Text style={s.accountTitle}>{auth.status === 'signed-in' ? 'Kayıtlı hesap' : 'Misafir hesabı'}</Text>
        <Text style={s.accountDetail}>{auth.status === 'signed-in'
          ? auth.user?.email ?? 'Hesabın bu cihaza bağlı.'
          : 'Misafir profilini hesabına dönüştürebilir veya kalıcı olarak silebilirsin.'}</Text>
        <Pressable accessibilityRole="button" onPress={() => setAccountOpen(true)} style={s.primary}><Text style={s.primaryText}>Hesabı yönet</Text></Pressable>
      </View>

      <Text style={s.sectionTitle}>YASAL VE GİZLİLİK</Text>
      <View style={s.card}>
        <LinkRow label="Gizlilik politikası" detail="Toplanan veriler ve kullanım amaçları" url={PRIVACY_POLICY_URL} />
        <LinkRow label={TERMS_LABEL} detail={TERMS_LABEL === 'Apple Standart EULA' ? 'iOS lisans koşulları' : 'Android uygulama koşulları'} url={TERMS_URL} />
        <LinkRow label="Hesap ve veri silme" detail="Uygulama dışından silme talebi gönder" url={DELETE_ACCOUNT_URL} />
      </View>
      <Text style={s.footer}>AMERİKANO · SÜRÜM 1.0.0</Text>
    </ScrollView>

    <Modal visible={accountOpen} transparent animationType="slide" onRequestClose={() => setAccountOpen(false)}>
      <View style={s.modalRoot}>
        <Pressable accessibilityLabel="Hesap penceresini kapat" style={s.modalBackdrop} onPress={() => setAccountOpen(false)} />
        <View style={s.sheet}><View style={s.sheetHandle} /><ScrollView keyboardShouldPersistTaps="handled"><AuthPanel onClose={() => setAccountOpen(false)} /></ScrollView></View>
      </View>
    </Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.felt },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 10, paddingBottom: 36 },
  backButton: { alignSelf: 'flex-start', minHeight: 42, justifyContent: 'center', paddingRight: 18 },
  backText: { color: p.cream, fontSize: 14, fontWeight: '800' },
  eyebrow: { color: p.gold, fontSize: 10, letterSpacing: 2.4, fontWeight: '900', marginTop: 10 },
  title: { color: p.cream, fontSize: 34, lineHeight: 39, fontWeight: '900', marginTop: 8 },
  body: { color: p.muted, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 13 },
  sectionTitle: { color: p.gold, fontSize: 9, letterSpacing: 2, fontWeight: '900', marginTop: 18, marginBottom: 8 },
  card: { borderRadius: 18, borderWidth: 1, borderColor: p.line, backgroundColor: '#071e154d', overflow: 'hidden' },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.line },
  rowCopy: { flex: 1 },
  rowTitle: { color: p.cream, fontSize: 14, fontWeight: '800' },
  rowDetail: { color: p.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  switchTrack: { width: 45, height: 27, padding: 3, borderRadius: 14, backgroundColor: '#708077' },
  switchTrackOn: { backgroundColor: p.gold },
  switchKnob: { width: 21, height: 21, borderRadius: 11, backgroundColor: p.paper },
  switchKnobOn: { alignSelf: 'flex-end' },
  openText: { color: p.gold, fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  accountCard: { borderRadius: 18, borderWidth: 1, borderColor: '#d9a44142', backgroundColor: '#d9a4410d', padding: 17 },
  accountTitle: { color: p.cream, fontSize: 16, fontWeight: '900' },
  accountDetail: { color: p.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  primary: { minHeight: 49, borderRadius: 12, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  primaryText: { color: p.ink, fontSize: 14, fontWeight: '900' },
  footer: { color: '#708f7d', fontSize: 8, fontWeight: '800', letterSpacing: 1.4, textAlign: 'center', marginTop: 25 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#03110bc7' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#123d2b', borderWidth: 1, borderBottomWidth: 0, borderColor: p.line, paddingHorizontal: 22, paddingBottom: 30, paddingTop: 9 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#ffffff36', alignSelf: 'center', marginBottom: 17 },
});
