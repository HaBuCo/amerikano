import { useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { palette as p } from '@/constants/palette';
import {
  clearAuthError,
  continueAnonymously,
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

type Mode = 'sign-in' | 'sign-up' | 'forgot' | 'new-password';

export function AuthPanel({ entry = false, onClose }: { entry?: boolean; onClose?: () => void }) {
  const auth = useAuth();
  const incomingUrl = Linking.useLinkingURL();
  const [mode, setMode] = useState<Mode>(auth.status === 'anonymous' ? 'sign-up' : 'sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deleteText, setDeleteText] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (incomingUrl) void handleAuthLink(incomingUrl);
  }, [incomingUrl]);

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

  if (auth.status === 'signed-in' && activeMode !== 'new-password') {
    return <View style={s.panel}>
      <PanelHeader eyebrow="HESABIM" title="Oyunun her cihazda seninle." onClose={onClose} />
      <View style={s.member}>
        <View style={s.memberCopy}>
          <Text style={s.white}>{auth.user?.user_metadata?.full_name ?? 'Amerikano oyuncusu'}</Text>
          {!!auth.user?.email && <Text style={s.body}>{auth.user.email}</Text>}
        </View>
        <View style={s.savedBadge}><Text style={s.savedBadgeText}>KAYITLI</Text></View>
      </View>
      <Text style={s.body}>Profilin, seviyen ve çevrim içi istatistiklerin bu hesaba bağlı.</Text>
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
          <Text style={s.body}>Profilin, kullanıcı adın, seviyen, istatistiklerin ve arkadaşlıkların geri alınamaz. Onaylamak için SİL yaz.</Text>
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
      <Messages />
    </View>;
  }

  return <View style={s.panel}>
    <PanelHeader
      eyebrow={entry ? 'MASAYA HOŞ GELDİN' : auth.status === 'anonymous' ? 'MİSAFİR PROFİLİ' : 'HESAP'}
      title={activeMode === 'forgot' ? 'Parolanı yenile.' : activeMode === 'new-password' ? 'Yeni parolanı belirle.' : entry ? 'Nasıl devam etmek istersin?' : 'İlerlemeni güvenceye al.'}
      onClose={onClose}
    />
    {entry && (activeMode === 'sign-in' || activeMode === 'sign-up') && <>
      <Pressable accessibilityRole="button" disabled={auth.busy} style={[s.guestButton, auth.busy && s.disabled]} onPress={() => void continueAnonymously()}>
        <View style={s.guestCopy}><Text style={s.guestTitle}>Anonim olarak devam et</Text><Text style={s.guestCaption}>Hesap oluşturmadan hemen oyna</Text></View>
      </Pressable>
      <View style={s.orRow}><View style={s.orLine} /><Text style={s.orText}>veya hesabını kullan</Text><View style={s.orLine} /></View>
    </>}
    {(activeMode === 'sign-in' || activeMode === 'sign-up') && <>
      <View style={s.tabs}>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: activeMode === 'sign-in' }} onPress={() => changeMode('sign-in')} style={[s.tab, activeMode === 'sign-in' && s.tabActive]}>
          <Text style={[s.tabText, activeMode === 'sign-in' && s.tabTextActive]}>Giriş yap</Text>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: activeMode === 'sign-up' }} onPress={() => changeMode('sign-up')} style={[s.tab, activeMode === 'sign-up' && s.tabActive]}>
          <Text style={[s.tabText, activeMode === 'sign-up' && s.tabTextActive]}>Kayıt ol</Text>
        </Pressable>
      </View>
      <Text style={s.body}>{activeMode === 'sign-in'
        ? 'Kaldığın masaya dönmek için hesabınla giriş yap.'
        : auth.status === 'anonymous'
          ? 'Misafir ilerlemen kaybolmadan hesabına aktarılır.'
          : 'Profilini ve ilerlemeni farklı cihazlarda da koru.'}</Text>
      <View style={s.socialRow}>
        {Platform.OS === 'ios' && <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={13}
          style={s.appleButton}
          onPress={() => void signInWithApple()}
        />}
        <Pressable accessibilityRole="button" disabled={auth.busy || !googleSignInConfigured} style={[s.googleButton, (auth.busy || !googleSignInConfigured) && s.disabled]} onPress={() => void signInWithGoogle()}>
          <Text style={s.googleText}>Google ile devam et</Text>
        </Pressable>
      </View>
      <View style={s.orRow}><View style={s.orLine} /><Text style={s.orText}>veya e-posta</Text><View style={s.orLine} /></View>
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

    {activeMode === 'sign-in' && <Pressable accessibilityRole="button" onPress={() => changeMode('forgot')}><Text style={s.link}>Şifremi unuttum</Text></Pressable>}
    {(activeMode === 'forgot' || activeMode === 'new-password') && <Pressable accessibilityRole="button" onPress={() => changeMode('sign-in')}><Text style={s.link}>Giriş seçeneklerine dön</Text></Pressable>}

    {auth.status === 'anonymous' && !entry && <>
      <View style={s.divider} />
      {!deleteOpen ? (
        <Pressable accessibilityRole="button" onPress={() => { clearAuthError(); setDeleteOpen(true); }}>
          <Text style={s.deleteLink}>Misafir hesabımı ve verilerimi sil</Text>
        </Pressable>
      ) : (
        <View style={s.dangerPanel}>
          <Text style={s.dangerTitle}>Misafir hesabını kalıcı olarak sil</Text>
          <Text style={s.body}>Bu cihazdaki oturumunla birlikte sunucudaki profilin, kullanıcı adın, oyun kayıtların ve arkadaşlıkların silinir. Onaylamak için SİL yaz.</Text>
          <TextInput accessibilityLabel="Misafir hesap silme onayı" autoCapitalize="characters" value={deleteText} onChangeText={setDeleteText}
            placeholder="SİL" placeholderTextColor={p.muted} style={s.input} />
          <Pressable accessibilityRole="button" disabled={deleteText.trim().toLocaleUpperCase('tr-TR') !== 'SİL' || auth.busy}
            style={[s.deleteButton, (deleteText.trim().toLocaleUpperCase('tr-TR') !== 'SİL' || auth.busy) && s.disabled]}
            onPress={() => void deleteAccount()}>
            <Text style={s.deleteButtonText}>{auth.busy ? 'Siliniyor…' : 'Misafir hesabımı kalıcı olarak sil'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setDeleteText(''); setDeleteOpen(false); }}><Text style={s.link}>Vazgeç</Text></Pressable>
        </View>
      )}
    </>}

    <Messages />
  </View>;
}

function PanelHeader({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose?: () => void }) {
  return <View style={s.header}>
    <View style={s.headerCopy}><Text style={s.eyebrow}>{eyebrow}</Text><Text style={s.title}>{title}</Text></View>
    {!!onClose && <Pressable accessibilityRole="button" accessibilityLabel="Kapat" onPress={onClose} style={s.close}><Text style={s.closeText}>Kapat</Text></Pressable>}
  </View>;
}

function Messages() {
  const auth = useAuth();
  return <>
    {!!auth.info && <View style={s.info}><Text style={s.body}>{auth.info}</Text></View>}
    {!!auth.error && <View style={s.error}><Text style={s.errorText}>{auth.error}</Text></View>}
  </>;
}

const s = StyleSheet.create({
  panel: { width: '100%', gap: 13 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  headerCopy: { flex: 1, gap: 7 },
  eyebrow: { color: p.gold, letterSpacing: 2.4, fontSize: 10, fontWeight: '900' },
  title: { color: p.cream, fontSize: 28, lineHeight: 33, fontWeight: '900', letterSpacing: -0.7 },
  close: { minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: p.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13 },
  closeText: { color: p.cream, fontSize: 11, fontWeight: '800' },
  body: { color: p.muted, fontSize: 14, lineHeight: 20 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: '#071e1566', borderWidth: 1, borderColor: p.line },
  tab: { flex: 1, minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: p.cream },
  tabText: { color: p.muted, fontSize: 14, fontWeight: '800' },
  tabTextActive: { color: p.ink },
  socialRow: { gap: 9 },
  appleButton: { width: '100%', height: 52 },
  googleButton: { minHeight: 52, borderRadius: 13, backgroundColor: '#fff', flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center' },
  googleText: { color: '#1f1f1f', fontSize: 15, fontWeight: '700' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 },
  orLine: { flex: 1, height: 1, backgroundColor: p.line },
  orText: { color: p.muted, fontSize: 11 },
  label: { color: p.gold, fontSize: 9, letterSpacing: 1.8, fontWeight: '900', marginTop: 2 },
  input: { paddingHorizontal: 16, minHeight: 52, borderRadius: 13, borderWidth: 1, borderColor: p.line, color: p.cream, backgroundColor: '#ffffff09', fontSize: 16 },
  primary: { borderRadius: 13, minHeight: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: p.gold, marginTop: 2 },
  primaryText: { color: p.ink, fontWeight: '900', fontSize: 16 },
  secondary: { borderRadius: 13, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.line },
  white: { color: p.cream, fontSize: 15, fontWeight: '800' },
  link: { color: p.gold, fontSize: 13, paddingVertical: 5, textAlign: 'center', fontWeight: '700' },
  divider: { height: 1, backgroundColor: p.line, marginVertical: 2 },
  guestButton: { minHeight: 68, borderRadius: 15, borderWidth: 1, borderColor: '#d9a44166', backgroundColor: '#d9a44112', justifyContent: 'center', paddingHorizontal: 16 },
  guestCopy: { flex: 1 },
  guestTitle: { color: p.cream, fontSize: 15, fontWeight: '900' },
  guestCaption: { color: p.muted, fontSize: 11, marginTop: 4 },
  member: { padding: 14, borderRadius: 15, borderWidth: 1, borderColor: p.line, backgroundColor: '#ffffff08', flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberCopy: { flex: 1, gap: 3 },
  savedBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#2d8b6533' },
  savedBadgeText: { color: '#9bd5b5', fontSize: 8, letterSpacing: 1.2, fontWeight: '900' },
  info: { borderRadius: 12, backgroundColor: '#1f5c3f55', padding: 13 },
  error: { borderRadius: 12, backgroundColor: '#842c2c55', padding: 13 },
  errorText: { color: '#f4b1ac', fontSize: 13, lineHeight: 19 },
  validation: { color: '#f0aaa4', fontSize: 12 },
  disabled: { opacity: 0.42 },
  deleteLink: { color: '#f0aaa4', fontSize: 13, paddingVertical: 8, textAlign: 'center' },
  dangerPanel: { borderRadius: 14, borderWidth: 1, borderColor: '#a84b4b88', padding: 15, gap: 11 },
  dangerTitle: { color: '#f4b1ac', fontSize: 16, fontWeight: '800' },
  deleteButton: { borderRadius: 12, minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: '#a83e3e' },
  deleteButtonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
