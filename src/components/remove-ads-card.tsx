import { useTranslations } from '@/i18n/language';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { palette as p } from '@/constants/palette';
import { fetchRemoveAdsOffer, hasRemovedAds, purchaseRemoveAds, restorePurchases, subscribeRemoveAds } from '@/purchases/purchases';

export function RemoveAdsCard({ compact = false }: { compact?: boolean }) {
  const { t, localizeMessage } = useTranslations();
  const [removedAds, setRemovedAds] = useState(hasRemovedAds());
  const [offer, setOffer] = useState<{ priceString: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => subscribeRemoveAds(() => setRemovedAds(hasRemovedAds())), []);
  useEffect(() => {
    if (removedAds) return;
    let active = true;
    void fetchRemoveAdsOffer().then((result) => { if (active) setOffer(result); });
    return () => { active = false; };
  }, [removedAds]);

  if (Platform.OS === 'web' || (compact && removedAds)) return null;

  async function buy() {
    setBusy(true); setError('');
    const result = await purchaseRemoveAds();
    setBusy(false);
    if (!result.ok && !result.cancelled) setError(result.error ?? t("Satın alma tamamlanamadı."));
  }
  async function restore() {
    setBusy(true); setError('');
    const result = await restorePurchases();
    setBusy(false);
    if (!result.ok) setError(result.error ?? t("Geri yükleme başarısız oldu."));
    else if (!hasRemovedAds()) setError(t("Bu hesaba bağlı bir satın alma bulunamadı."));
  }

  if (compact) return <View style={s.compactCard}>
    <View style={s.compactCopy}>
      <Text style={s.compactTitle}>{t("Reklamsız oyna")}</Text>
      {error ? <Text numberOfLines={1} style={s.adsError}>{localizeMessage(error)}</Text> : <Pressable accessibilityRole="button" disabled={busy} onPress={() => void restore()}><Text style={s.compactRestore}>{t("Satın almayı geri yükle")}</Text></Pressable>}
    </View>
    <Pressable accessibilityRole="button" disabled={busy || !offer} onPress={() => void buy()} style={[s.compactButton, (busy || !offer) && s.disabled]}>
      <Text style={s.primaryText}>{busy ? t("İşleniyor…") : offer ? t("Kaldır · {0}", [offer.priceString]) : t("Yükleniyor…")}</Text>
    </Pressable>
  </View>;

  return <View style={s.adsCard}>
    {removedAds ? <>
      <Text style={s.adsTitle}>{t("Reklamlar kaldırıldı ✓")}</Text>
      <Text style={s.adsDetail}>{t("Desteğin için teşekkürler — artık banner ve el/maç arası reklam görmeyeceksin.")}</Text>
    </> : <>
      <Text style={s.adsTitle}>{t("Reklamları kaldır")}</Text>
      <Text style={s.adsDetail}>{t("Tek seferlik satın alma ile ana menüdeki banner'ı ve el/maç arası geçiş reklamlarını tamamen kapat.")}</Text>
      {!!error && <Text style={s.adsError}>{localizeMessage(error)}</Text>}
      <Pressable accessibilityRole="button" disabled={busy || !offer} onPress={() => void buy()} style={[s.primary, (busy || !offer) && s.disabled]}>
        <Text style={s.primaryText}>{busy ? t("İşleniyor…") : offer ? t("Satın al · {0}", [offer.priceString]) : t("Yükleniyor…")}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void restore()}><Text style={s.restoreLink}>{t("Satın almaları geri yükle")}</Text></Pressable>
    </>}
  </View>;
}

const s = StyleSheet.create({
  primary: { minHeight: 49, borderRadius: 12, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  primaryText: { color: p.ink, fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  compactCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: '#d9a44142', backgroundColor: '#d9a4410d', paddingVertical: 8, paddingLeft: 14, paddingRight: 8 },
  compactCopy: { flex: 1, minWidth: 0 }, compactTitle: { color: p.cream, fontSize: 14, fontWeight: '900' },
  compactRestore: { color: p.gold, fontSize: 11, fontWeight: '700', paddingVertical: 2 },
  compactButton: { minHeight: 38, paddingHorizontal: 14, borderRadius: 10, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center' },
  adsCard: { borderRadius: 18, borderWidth: 1, borderColor: '#d9a44142', backgroundColor: '#d9a4410d', padding: 17, marginBottom: 15 },
  adsTitle: { color: p.cream, fontSize: 16, fontWeight: '900' },
  adsDetail: { color: p.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  adsError: { color: '#e8877e', fontSize: 11, marginTop: 8 },
  restoreLink: { color: p.gold, fontSize: 11, fontWeight: '800', textAlign: 'center', paddingVertical: 10 },
});
