import { useTranslations } from '@/i18n/language';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { palette as p } from '@/constants/palette';
import { clearAuthError, deleteAccount, signOut, useAuth } from '@/network/auth';

export function AccountActions() {
  const { t, localizeMessage } = useTranslations();
  const auth = useAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [actionError, setActionError] = useState('');
  const anonymous = auth.status === 'anonymous';
  const canDelete = confirmation.trim().toLocaleUpperCase('tr-TR') === t("SİL") && !auth.busy;

  async function perform(action: () => Promise<unknown>) {
    setActionError('');
    try { await action(); }
    catch (error) { setActionError(error instanceof Error ? error.message : t("İşlem tamamlanamadı. Lütfen tekrar dene.")); }
  }

  if (auth.status !== 'signed-in' && !anonymous) return null;

  return <View style={s.section}>
    <Text style={s.sectionTitle}>{t("HESAP")}</Text>
    <View style={s.group}>
      {auth.status === 'signed-in' && <Pressable accessibilityRole="button" disabled={auth.busy}
        style={({ pressed }) => [s.row, s.rowDivider, auth.busy && s.disabled, pressed && s.rowPressed]} onPress={() => void perform(signOut)}>
        <AppIcon name="logout" size={20} color={p.gold} />
        <Text style={s.rowTitle}>{t("Çıkış yap")}</Text>
      </Pressable>}
      {/* Deleting asks for a typed confirmation right below the row, inside the same list. */}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: deleteOpen }} disabled={auth.busy || deleteOpen}
        style={({ pressed }) => [s.row, deleteOpen && s.rowDivider, auth.busy && s.disabled, pressed && s.rowPressed]}
        onPress={() => { clearAuthError(); setActionError(''); setDeleteOpen(true); }}>
        <AppIcon name="trash" size={20} color={DANGER} />
        <Text style={[s.rowTitle, s.dangerText]}>{anonymous ? t("Misafir hesabımı ve verilerimi sil") : t("Hesabımı sil")}</Text>
      </Pressable>
      {deleteOpen && <View style={s.dangerPanel}>
        <Text style={s.dangerTitle}>{anonymous ? t("Misafir hesabını kalıcı olarak sil") : t("Hesabı kalıcı olarak sil")}</Text>
        <Text style={s.body}>{t("Profilin, kullanıcı adın, coin bakiyen, oyun kayıtların ve arkadaşlıkların silinir. Bu işlem geri alınamaz. Onaylamak için SİL yaz.")}</Text>
        <TextInput accessibilityLabel={t("Hesap silme onayı")} autoCapitalize="characters" autoCorrect={false}
          editable={!auth.busy} value={confirmation} onChangeText={setConfirmation} placeholder={t("SİL")} placeholderTextColor={p.muted} style={s.input} />
        <View style={s.dangerActions}>
          <Pressable accessibilityRole="button" disabled={auth.busy} style={s.cancel}
            onPress={() => { setConfirmation(''); setDeleteOpen(false); setActionError(''); clearAuthError(); }}>
            <Text style={s.cancelText}>{t("Vazgeç")}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={!canDelete} style={[s.deleteButton, !canDelete && s.disabled]}
            onPress={() => void perform(deleteAccount)}>
            <Text style={s.deleteButtonText}>{auth.busy ? t("Siliniyor…") : t("Kalıcı olarak sil")}</Text>
          </Pressable>
        </View>
      </View>}
    </View>
    {!!(actionError || auth.error) && <Text accessibilityRole="alert" style={s.error}>{localizeMessage(actionError || auth.error)}</Text>}
  </View>;
}

const DANGER = '#f0aaa4';

const s = StyleSheet.create({
  section: { gap: 8 },
  sectionTitle: { color: p.gold, fontSize: 10, letterSpacing: 2, fontWeight: '900', marginTop: 6, marginLeft: 4 },
  group: { borderRadius: 18, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, overflow: 'hidden' },
  row: { minHeight: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 13 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: p.line },
  rowPressed: { backgroundColor: '#ffffff0a' },
  rowTitle: { color: p.cream, fontSize: 14, fontWeight: '800', flexShrink: 1 },
  dangerText: { color: DANGER },
  dangerPanel: { padding: 14, gap: 12, backgroundColor: '#a83e3e14' },
  dangerTitle: { color: '#f4b1ac', fontSize: 15, fontWeight: '900' },
  body: { color: p.muted, fontSize: 12, lineHeight: 18 },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: p.line, paddingHorizontal: 14, color: p.cream, fontSize: 16, backgroundColor: '#0000001f' },
  dangerActions: { flexDirection: 'row', gap: 10 },
  cancel: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.line },
  cancelText: { color: p.cream, fontSize: 14, fontWeight: '800' },
  deleteButton: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: '#a83e3e', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  deleteButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  error: { color: '#f4b1ac', fontSize: 13, lineHeight: 20, marginLeft: 4 },
});
