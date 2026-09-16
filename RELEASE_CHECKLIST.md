# İlk Sürüm Kontrol Listesi

Her TestFlight / kapalı Android test sürümünden önce aşağıdaki kısa kontrol yapılır.

## Otomatik kontroller

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npx expo install --check`

## İki gerçek cihaz

- [ ] iOS ve Android aynı hızlı masaya giriyor; 5 saniye sonra oyun başlıyor.
- [ ] Özel oda kodu, arkadaş daveti ve arkadaşın masasına oturma çalışıyor.
- [ ] Bir cihaz arka plana alınıp 60 saniye sonra açıldığında aynı ele dönüyor.
- [ ] İnternet 15 saniye kapatılıp açıldığında “yeniden bağlanıyor” durumu kayboluyor ve el korunuyor.
- [ ] Üç süre kaçıran koltuk bota geçiyor; oyuncu koltuğunu geri alabiliyor.
- [ ] Kalıcı ayrılan oyuncunun yerine bot devam ediyor; kalan oyuncu masa sahibi olabiliyor.
- [ ] Ceza kartı isteme süresi, jokeri tam kartla değiştirme ve ilk 5 el joker yasağı doğru çalışıyor.
- [ ] El sonu cezası, kalan kartlar ve toplam puan iki cihazda aynı görünüyor.
- [ ] 12. elden sonra aynı kazanan/sıralama görünüyor ve tekrar oynama çalışıyor.
- [ ] Ses, titreşim, küçük kart ve sürükleme ipucu ayarları uygulama yeniden açılınca korunuyor.

## Mağaza öncesi

- [ ] Supabase `telemetry` Function loglarında yeni kritik hata yok.
- [ ] iPhone küçük ekran ve büyük ekran Android’de kartlar/hedefler taşmıyor.
- [ ] App Store gizlilik, yaş derecelendirmesi ve destek bağlantıları son kez kontrol edildi.
