# İlk Sürüm Kontrol Listesi

Her TestFlight / kapalı Android test sürümünden önce aşağıdaki kısa kontrol yapılır.

## Otomatik kontroller

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npx expo install --check`

## İki gerçek cihaz

- [ ] iOS ve Android aynı hızlı masaya giriyor; 5 saniye sonra oyun başlıyor.
- [ ] Ana ekrandaki çevrim içi oyuncu sayısı Türkçe/İngilizce görünüyor; ikinci cihaz açılınca artıyor, uygulama arka planda 60 saniye kalınca azalıyor.
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

- [ ] Temiz iOS kurulumunda EEA ağında Google UMP formu ATT'den önce açılıyor; UMP reddi ATT'yi ve reklamları başlatmıyor.
- [ ] UMP kabulü ardından ATT reddinde reklam isteği yok; sonraki açılışta UMP reklam izni tekrar gösterilmiyor.
- [ ] EEA dışı temiz iOS kurulumunda gerekli olmayan UMP formu gösterilmiyor; ATT reddinde reklamlar kapalı.
- [ ] iOS sistem izninde uygulama adı “Amerikano”; eski “Kitaptik” görünmüyor.
- [ ] iPhone dili Türkçe ve İngilizce iken ATT açıklaması ilgili dilde görünüyor; uygulama içindeki dil seçiminin sistem izin dilini değiştirmediği doğrulanıyor.
- [ ] AdMob → Privacy & messaging → European regulations mesajında varsayılan ve ek diller arasında Türkçe ve İngilizce yayımlanmış; iki cihaz dilinde UMP formu kontrol edildi.
- [ ] App Store Connect Review Notes, EEA ve EEA dışındaki izin sırasını ve red davranışını açıklıyor.
- [ ] Supabase `telemetry` Function loglarında yeni kritik hata yok.
- [ ] iPhone küçük ekran ve büyük ekran Android’de kartlar/hedefler taşmıyor.
- [ ] App Store gizlilik, yaş derecelendirmesi ve destek bağlantıları son kez kontrol edildi.
