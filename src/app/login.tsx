import { useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  clearAuthError,
  deleteAccount,
  googleSignInConfigured,
  handleAuthLink,
  requestPasswordReset,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
  updatePassword,
  useAuth,
} from '@/network/auth';
import { palette as p } from '@/constants/palette';

type Mode = 'sign-in' | 'sign-up' | 'forgot' | 'new-password';

export default function LoginScreen() {
  const auth = useAuth();
  const incomingUrl = Linking.useLinkingURL();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deleteText, setDeleteText] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (incomingUrl) void handleAuthLink(incomingUrl);
  }, [incomingUrl]);
  useEffect(() => {
    if (Platform.OS === 'ios') void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const activeMode: Mode = auth.recovery ? 'new-password' : mode;
  const passwordMatches = password === confirmPassword;
  const needsConfirmation = activeMode === 'sign-up' || activeMode === 'new-password';
  const validEmail = /\S+@\S+\.\S+/.test(email);
  const canSubmit = activeMode === 'forgot'
    ? validEmail && !auth.busy
    : (activeMode === 'new-password' || validEmail)
      && password.length >= 6
      && (!needsConfirmation || passwordMatches)
      && !auth.busy;

  const changeMode = (next: Mode) => {
    clearAuthError();
    setPassword('');
    setConfirmPassword('');
    setMode(next);
  };

  const submit = () => {
    if (activeMode === 'forgot') void requestPasswordReset(email);
    else if (activeMode === 'new-password') void updatePassword(password);
    else if (activeMode === 'sign-up') void signUpWithEmail(email, password);
    else void signInWithEmail(email, password);
  };

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={s.back}>← Ana menü</Text></Pressable>

        {auth.status === 'signed-in' && activeMode !== 'new-password' ? (
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

            <View style={s.divider} />
            {!deleteOpen ? (
              <Pressable accessibilityRole="button" onPress={() => { clearAuthError(); setDeleteOpen(true); }}>
                <Text style={s.deleteLink}>Hesabımı sil</Text>
              </Pressable>
            ) : (
              <View style={s.dangerPanel}>
                <Text style={s.dangerTitle}>Hesabı kalıcı olarak sil</Text>
                <Text style={s.body}>Profilin, seviyen ve çevrim içi istatistiklerin geri alınamayacak şekilde silinir. Onaylamak için SİL yaz.</Text>
                <TextInput accessibilityLabel="Hesap silme onayı" autoCapitalize="characters" value={deleteText} onChangeText={setDeleteText}
                  placeholder="SİL" placeholderTextColor={p.muted} style={s.input} />
                <Pressable accessibilityRole="button" disabled={deleteText.trim().toLocaleUpperCase('tr-TR') !== 'SİL' || auth.busy}
                  style={[s.deleteButton, (deleteText.trim().toLocaleUpperCase('tr-TR') !== 'SİL' || auth.busy) && s.disabled]}
                  onPress={() => void deleteAccount()}>
                  <Text style={s.deleteButtonText}>{auth.busy ? 'Siliniyor…' : 'Hesabımı kalıcı olarak sil'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => { setDeleteText(''); setDeleteOpen(false); }}><Text style={s.link}>Vazgeç</Text></Pressable>
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={s.eyebrow}>{activeMode === 'new-password' ? 'PAROLA YENİLEME' : 'GİRİŞ'}</Text>
            <Text style={s.title}>{activeMode === 'sign-in' ? 'Tekrar hoş geldin.' : activeMode === 'sign-up' ? 'Hesap oluştur.' : activeMode === 'forgot' ? 'Parolanı yenile.' : 'Yeni parola oluştur.'}</Text>
            <Text style={s.body}>{activeMode === 'sign-in' || activeMode === 'sign-up'
              ? 'Giriş yapmak zorunlu değil; misafir olarak da oynayabilirsin. Hesabın olursa profilin cihazlar arasında seninle gelir.'
              : activeMode === 'forgot' ? 'E-posta adresine uygulamayı yeniden açan güvenli bir bağlantı göndereceğiz.'
                : 'Yeni parolan en az 6 karakter olmalı.'}</Text>

            {(activeMode === 'sign-in' || activeMode === 'sign-up') && <>
              {appleAvailable && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={13}
                  style={s.appleButton}
                  onPress={() => void signInWithApple()}
                />
              )}
              {Platform.OS !== 'web' && googleSignInConfigured && (
                <Pressable accessibilityRole="button" disabled={auth.busy} style={[s.googleButton, auth.busy && s.disabled]} onPress={() => void signInWithGoogle()}>
                  <Text style={s.googleText}>G  Google ile devam et</Text>
                </Pressable>
              )}
              <View style={s.divider} />
            </>}

            {activeMode !== 'new-password' && <>
              <Text style={s.label}>E-POSTA</Text>
              <TextInput accessibilityLabel="E-posta" style={s.input} placeholder="ornek@eposta.com" placeholderTextColor={p.muted}
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} />
            </>}
            {activeMode !== 'forgot' && <>
              <Text style={s.label}>PAROLA</Text>
              <TextInput accessibilityLabel={activeMode === 'new-password' ? 'Yeni parola' : 'Parola'} style={s.input} placeholder="En az 6 karakter" placeholderTextColor={p.muted}
                secureTextEntry autoCapitalize="none" value={password} onChangeText={setPassword} />
            </>}
            {needsConfirmation && <>
              <Text style={s.label}>PAROLA TEKRAR</Text>
              <TextInput accessibilityLabel="Parola tekrar" style={s.input} placeholder="Parolanı yeniden yaz" placeholderTextColor={p.muted}
                secureTextEntry autoCapitalize="none" value={confirmPassword} onChangeText={setConfirmPassword} />
              {!!confirmPassword && !passwordMatches && <Text style={s.validation}>Parolalar aynı değil.</Text>}
            </>}

            <Pressable accessibilityRole="button" disabled={!canSubmit} style={[s.primary, !canSubmit && s.disabled]} onPress={submit}>
              <Text style={s.primaryText}>{activeMode === 'sign-in' ? 'Giriş yap' : activeMode === 'sign-up' ? 'Hesap oluştur' : activeMode === 'forgot' ? 'Bağlantı gönder' : 'Parolayı kaydet'}</Text>
            </Pressable>

            {activeMode === 'sign-in' && <>
              <Pressable accessibilityRole="button" onPress={() => changeMode('forgot')}><Text style={s.link}>Şifremi unuttum</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => changeMode('sign-up')}><Text style={s.link}>Hesabın yok mu? Kayıt ol</Text></Pressable>
            </>}
            {(activeMode === 'sign-up' || activeMode === 'forgot') && (
              <Pressable accessibilityRole="button" onPress={() => changeMode('sign-in')}><Text style={s.link}>← Giriş ekranına dön</Text></Pressable>
            )}
          </>
        )}

        {!!auth.info && <View style={s.info}><Text style={s.body}>{auth.info}</Text></View>}
        {!!auth.error && <View style={s.error}><Text style={s.body}>{auth.error}</Text></View>}
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
  appleButton: { width: '100%', height: 52 },
  googleButton: { minHeight: 52, borderRadius: 13, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  googleText: { color: '#1f1f1f', fontSize: 16, fontWeight: '700' },
  member: { padding: 18, borderRadius: 14, borderWidth: 1, borderColor: p.line, gap: 4 },
  info: { borderRadius: 12, backgroundColor: '#1f5c3f55', padding: 14 },
  error: { borderRadius: 12, backgroundColor: '#842c2c55', padding: 14 },
  validation: { color: '#f0aaa4', fontSize: 12 },
  deleteLink: { color: '#f0aaa4', fontSize: 14, paddingVertical: 10, textAlign: 'center' },
  dangerPanel: { borderRadius: 14, borderWidth: 1, borderColor: '#a84b4b88', padding: 16, gap: 12 },
  dangerTitle: { color: '#f4b1ac', fontSize: 17, fontWeight: '800' },
  deleteButton: { borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: '#a83e3e' },
  deleteButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
