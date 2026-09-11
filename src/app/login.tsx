import { useState } from 'react';
import { router } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clearAuthError, signInWithApple, signInWithEmail, signInWithGoogle, signOut, signUpWithEmail, useAuth } from '@/network/auth';
import { palette as p } from '@/constants/palette';

export default function LoginScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit = /\S+@\S+\.\S+/.test(email) && password.length >= 6 && !auth.busy;

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={s.back}>← Ana menü</Text></Pressable>

        {auth.status === 'signed-in' ? (
          <>
            <Text style={s.eyebrow}>HESABIM</Text>
            <Text style={s.title}>Tekrar hoş geldin.</Text>
            <View style={s.member}>
              <Text style={s.white}>{auth.user?.user_metadata?.full_name ?? auth.user?.email ?? 'Oyuncu'}</Text>
              {!!auth.user?.email && <Text style={s.body}>{auth.user.email}</Text>}
            </View>
            <Pressable accessibilityRole="button" disabled={auth.busy} style={[s.secondary, auth.busy && s.disabled]} onPress={() => void signOut()}>
              <Text style={s.white}>Çıkış yap</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={s.eyebrow}>GİRİŞ</Text>
            <Text style={s.title}>{mode === 'sign-in' ? 'Tekrar hoş geldin.' : 'Hesap oluştur.'}</Text>
            <Text style={s.body}>Giriş yapmak zorunlu değil; misafir olarak da oynayabilirsin. Hesabın olursa profilin cihazlar arasında seninle gelir.</Text>

            {Platform.OS === 'ios' && (
              <Pressable accessibilityRole="button" disabled={auth.busy} style={[s.appleButton, auth.busy && s.disabled]} onPress={() => void signInWithApple()}>
                <Text style={s.appleText}>􀣺  Apple ile devam et</Text>
              </Pressable>
            )}
            {Platform.OS !== 'web' && (
              <Pressable accessibilityRole="button" disabled={auth.busy} style={[s.googleButton, auth.busy && s.disabled]} onPress={() => void signInWithGoogle()}>
                <Text style={s.googleText}>G  Google ile devam et</Text>
              </Pressable>
            )}

            <View style={s.divider} />

            <Text style={s.label}>E-POSTA</Text>
            <TextInput accessibilityLabel="E-posta" style={s.input} placeholder="ornek@eposta.com" placeholderTextColor={p.muted}
              autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} />
            <Text style={s.label}>PAROLA</Text>
            <TextInput accessibilityLabel="Parola" style={s.input} placeholder="En az 6 karakter" placeholderTextColor={p.muted}
              secureTextEntry autoCapitalize="none" value={password} onChangeText={setPassword} />

            <Pressable accessibilityRole="button" disabled={!canSubmit} style={[s.primary, !canSubmit && s.disabled]}
              onPress={() => void (mode === 'sign-in' ? signInWithEmail(email, password) : signUpWithEmail(email, password))}>
              <Text style={s.primaryText}>{mode === 'sign-in' ? 'Giriş yap' : 'Hesap oluştur'}</Text>
            </Pressable>

            <Pressable accessibilityRole="button" onPress={() => { clearAuthError(); setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); }}>
              <Text style={s.link}>{mode === 'sign-in' ? 'Hesabın yok mu? Kayıt ol' : 'Zaten hesabın var mı? Giriş yap'}</Text>
            </Pressable>

            {!!auth.info && <View style={s.info}><Text style={s.body}>{auth.info}</Text></View>}
            {!!auth.error && <View style={s.error}><Text style={s.body}>{auth.error}</Text></View>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.felt },
  content: { padding: 26, gap: 14, width: '100%', maxWidth: 620, alignSelf: 'center' },
  back: { color: p.cream, fontSize: 15, paddingVertical: 10 },
  eyebrow: { color: p.gold, letterSpacing: 3, fontSize: 11, marginTop: 20, fontWeight: '800' },
  title: { color: p.cream, fontSize: 34, lineHeight: 39, fontWeight: '800' },
  body: { color: p.muted, fontSize: 15, lineHeight: 22 },
  label: { color: p.gold, fontSize: 10, letterSpacing: 2, fontWeight: '800', marginTop: 4 },
  input: { padding: 17, minHeight: 55, borderRadius: 12, borderWidth: 1, borderColor: p.line, color: p.cream, backgroundColor: '#ffffff08', fontSize: 16 },
  primary: { borderRadius: 13, minHeight: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: p.gold, marginTop: 4 },
  primaryText: { color: p.ink, fontWeight: '800', fontSize: 16 },
  secondary: { borderRadius: 13, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.line, marginTop: 6 },
  white: { color: p.cream, fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  divider: { height: 1, backgroundColor: p.line, marginVertical: 4 },
  link: { color: p.gold, fontSize: 14, paddingVertical: 8, textAlign: 'center' },
  appleButton: { minHeight: 52, borderRadius: 13, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  appleText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  googleButton: { minHeight: 52, borderRadius: 13, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  googleText: { color: '#1f1f1f', fontSize: 16, fontWeight: '700' },
  member: { padding: 18, borderRadius: 14, borderWidth: 1, borderColor: p.line, gap: 4 },
  info: { borderRadius: 12, backgroundColor: '#1f5c3f55', padding: 14 },
  error: { borderRadius: 12, backgroundColor: '#842c2c55', padding: 14 },
});
