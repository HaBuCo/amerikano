import { useEffect, useState } from 'react';
import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette as p } from '@/constants/palette';
import { AVATAR_OPTIONS, AvatarKey, PlayerProfile, profileLevel, refreshPlayerProfile, savePlayerProfile, usePlayerProfile } from '@/network/profile';

export default function ProfileScreen() {
  const state = usePlayerProfile();
  useEffect(() => { void refreshPlayerProfile(); }, []);
  const profile = state.profile;
  return <SafeAreaView style={s.page}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={s.back}>← Geri</Text></Pressable>
      <Text style={s.eyebrow}>OYUNCU PROFİLİ</Text>
      <Text style={s.title}>Masadaki sen.</Text>
      <Text style={s.body}>Adın ve avatarın bütün çevrim içi masalarda görünür.</Text>

      {profile ? <ProfileForm key={`${profile.userId}:${profile.displayName}:${profile.avatarKey}`} profile={profile} loading={state.loading} saving={state.saving} error={state.error} />
        : <Text style={state.error ? s.error : s.body}>{state.error || 'Profil hazırlanıyor…'}</Text>}
    </ScrollView>
  </SafeAreaView>;
}

function ProfileForm({ profile, loading, saving, error }: { profile: PlayerProfile; loading: boolean; saving: boolean; error: string }) {
  const [name, setName] = useState(profile.displayName);
  const [avatar, setAvatar] = useState<AvatarKey>(profile.avatarKey);
  const [saved, setSaved] = useState('');
  const save = async () => {
    setSaved('');
    try {
      await savePlayerProfile(name, avatar);
      setSaved('Profilin kaydedildi.');
    } catch { /* Store exposes a user-facing error. */ }
  };
  return <>
      <View style={s.stats}>
        <View style={s.stat}><Text style={s.statValue}>{profileLevel(profile?.experience ?? 0)}</Text><Text style={s.statLabel}>SEVİYE</Text></View>
        <View style={s.stat}><Text style={s.statValue}>{profile?.gamesPlayed ?? 0}</Text><Text style={s.statLabel}>MAÇ</Text></View>
        <View style={s.stat}><Text style={s.statValue}>{profile?.wins ?? 0}</Text><Text style={s.statLabel}>GALİBİYET</Text></View>
      </View>

      <Text style={s.label}>AVATAR</Text>
      <View style={s.avatars}>{AVATAR_OPTIONS.map((option) => <Pressable key={option.key} accessibilityRole="button"
        accessibilityLabel={`${option.key} avatarı`} accessibilityState={{ selected: avatar === option.key }}
        onPress={() => setAvatar(option.key)} style={[s.avatarRing, avatar === option.key && s.avatarSelected]}>
        <View style={[s.avatar, { backgroundColor: option.color }]}><Text style={s.avatarText}>{option.symbol}</Text></View>
      </Pressable>)}</View>

      <Text style={s.label}>OYUNCU ADI</Text>
      <TextInput accessibilityLabel="Oyuncu adı" maxLength={18} value={name} onChangeText={(value) => { setName(value); setSaved(''); }}
        placeholder="Adını yaz" placeholderTextColor={p.muted} style={s.input} />
      <Pressable accessibilityRole="button" disabled={!name.trim() || saving || loading}
        style={[s.primary, (!name.trim() || saving || loading) && s.disabled]} onPress={() => void save()}>
        <Text style={s.primaryText}>{saving ? 'Kaydediliyor…' : 'Profili kaydet'}</Text>
      </Pressable>
      {!!saved && <Text style={s.success}>{saved}</Text>}
      {!!error && <Text style={s.error}>{error}</Text>}
    </>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.felt }, content: { padding: 26, gap: 15, width: '100%', maxWidth: 620, alignSelf: 'center' },
  back: { color: p.cream, fontSize: 15, paddingVertical: 10 }, eyebrow: { color: p.gold, letterSpacing: 3, fontSize: 11, marginTop: 12, fontWeight: '800' },
  title: { color: p.cream, fontSize: 34, fontWeight: '800' }, body: { color: p.muted, fontSize: 15, lineHeight: 22 },
  stats: { flexDirection: 'row', borderWidth: 1, borderColor: p.line, borderRadius: 16, paddingVertical: 16, marginVertical: 5 },
  stat: { flex: 1, alignItems: 'center', gap: 3 }, statValue: { color: p.cream, fontSize: 22, fontWeight: '900' }, statLabel: { color: p.muted, fontSize: 9, letterSpacing: 1.5 },
  label: { color: p.gold, fontSize: 10, letterSpacing: 2, fontWeight: '800', marginTop: 5 }, avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
  avatarRing: { padding: 3, borderWidth: 2, borderColor: 'transparent', borderRadius: 30 }, avatarSelected: { borderColor: p.gold },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  input: { padding: 17, minHeight: 55, borderRadius: 12, borderWidth: 1, borderColor: p.line, color: p.cream, backgroundColor: '#ffffff08', fontSize: 17 },
  primary: { borderRadius: 13, minHeight: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: p.gold }, primaryText: { color: p.ink, fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.4 }, success: { color: '#9bd5b5', textAlign: 'center' }, error: { color: '#f0aaa4', textAlign: 'center' },
});
