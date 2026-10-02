import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { palette as p } from '@/constants/palette';
import { clearAuthError, deleteAccount, signOut, useAuth } from '@/network/auth';

export function AccountActions() {
  const auth = useAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [actionError, setActionError] = useState('');
  const anonymous = auth.status === 'anonymous';
  const canDelete = confirmation.trim().toLocaleUpperCase('tr-TR') === 'SİL' && !auth.busy;

  async function perform(action: () => Promise<unknown>) {
    setActionError('');
    try { await action(); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'İşlem tamamlanamadı. Lütfen tekrar dene.'); }
  }

  if (auth.status !== 'signed-in' && !anonymous) return null;

  return <View style={s.actions}>
    {auth.status === 'signed-in' && <Pressable accessibilityRole="button" disabled={auth.busy}
      style={[s.button, auth.busy && s.disabled]} onPress={() => void perform(signOut)}>
      <Text style={s.buttonText}>Çıkış yap</Text>
    </Pressable>}
    {!deleteOpen ? <Pressable accessibilityRole="button" disabled={auth.busy} style={[s.button, auth.busy && s.disabled]}
      onPress={() => { clearAuthError(); setActionError(''); setDeleteOpen(true); }}>
      <Text style={s.dangerText}>{anonymous ? 'Misafir hesabımı ve verilerimi sil' : 'Hesabımı sil'}</Text>
    </Pressable> : <View style={s.dangerPanel}>
      <Text style={s.dangerTitle}>{anonymous ? 'Misafir hesabını kalıcı olarak sil' : 'Hesabı kalıcı olarak sil'}</Text>
      <Text style={s.body}>Profilin, kullanıcı adın, seviyen, oyun kayıtların ve arkadaşlıkların silinir. Bu işlem geri alınamaz. Onaylamak için SİL yaz.</Text>
      <TextInput accessibilityLabel="Hesap silme onayı" autoCapitalize="characters" autoCorrect={false}
        editable={!auth.busy} value={confirmation} onChangeText={setConfirmation} placeholder="SİL" placeholderTextColor={p.muted} style={s.input} />
      <Pressable accessibilityRole="button" disabled={!canDelete} style={[s.deleteButton, !canDelete && s.disabled]}
        onPress={() => void perform(deleteAccount)}>
        <Text style={s.deleteButtonText}>{auth.busy ? 'Siliniyor…' : 'Hesabımı kalıcı olarak sil'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={auth.busy} style={s.cancel}
        onPress={() => { setConfirmation(''); setDeleteOpen(false); setActionError(''); clearAuthError(); }}>
        <Text style={s.buttonText}>Vazgeç</Text>
      </Pressable>
    </View>}
    {!!(actionError || auth.error) && <Text accessibilityRole="alert" style={s.error}>{actionError || auth.error}</Text>}
  </View>;
}

const s = StyleSheet.create({
  actions: { gap: 10, marginTop: 24 },
  button: { minHeight: 52, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: p.line, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: p.cream, fontSize: 14, fontWeight: '800' },
  dangerText: { color: '#f0aaa4', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  dangerPanel: { borderRadius: 14, borderWidth: 1, borderColor: '#a84b4b88', padding: 16, gap: 12 },
  dangerTitle: { color: '#f4b1ac', fontSize: 16, fontWeight: '800' },
  body: { color: p.muted, fontSize: 13, lineHeight: 20 },
  input: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: p.line, paddingHorizontal: 16, color: p.cream, fontSize: 16 },
  deleteButton: { minHeight: 50, borderRadius: 12, backgroundColor: '#a83e3e', alignItems: 'center', justifyContent: 'center', padding: 12 },
  deleteButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  error: { color: '#f4b1ac', fontSize: 13, lineHeight: 20 },
});
