# Amerikano

iOS ve Android için Expo + React Native Amerikano: botlara karşı tek oyunculu,
3–6 kişilik aynı cihaz modu ve 2–6 kişilik kodla katılınan çevrim içi arkadaş odaları.
Klasik resimli kartların CC0 lisansı ve kaynağı assets/cards altında bulunur.

## Çalıştırma

Gereksinimler: Node.js 24 ve SDK 57 uyumlu Expo geliştirme ortamı.

```bash
npm install
npm start
```

Terminalde görünen QR kodunu Expo Go ile tarayın. Android emülatörü için `npm run android`; macOS üzerindeki iOS simülatörü için `npm run ios` kullanılabilir.

## iOS / TestFlight

TestFlight derlemeleri EAS'in `production` profiliyle hazırlanır. İlk kurulumda Expo
hesabına giriş yaptıktan sonra proje EAS'e bağlanır ve `production` ortamına
`EXPO_PUBLIC_SUPABASE_URL` ile `EXPO_PUBLIC_SUPABASE_KEY` eklenir. Ardından:

```powershell
npx eas-cli build --platform ios --profile production --auto-submit
```

Komut Apple dağıtım sertifikası ve provisioning profile oluşturma adımlarında yönlendirir.
Derleme App Store Connect tarafından işlendikten sonra TestFlight'ta iç test grubuna
eklenebilir. Google ile iOS girişini açmadan önce gerçek Google iOS Client ID değeri hem
EAS ortamına eklenmeli hem de `app.json` içindeki Google URL şemasına yazılmalıdır.

## İlk sürümde olanlar

- 3–6 oyunculu aynı cihaz modu
- 2–6 oyunculu çevrim içi arkadaş odaları
- Mevcut 12 el ve açılış görevleri (ayrıntılar: [RULES.md](RULES.md))
- 106 kartlık deste, seri/küt ve joker doğrulaması
- İlk beş elde açılışta joker yasağı; yalnızca yüksek As
- 14/13 dağıtım, ters yönde sıra, ceza kartıyla sıra dışı alma
- Açılış sırası işleme kilidi, atomik final ve kapalı bitiş kartı
- Tek oyunculu oyunu cihazda otomatik saklama, devam etme veya yeni oyun başlatma
- Kart çekme, atma, açma, joker ve kazanma için özgün kısa sesler; kalıcı sessize alma
- Kartları sürükleyip istenen konuma bırakan, tur değişince korunan kişisel el dizilimi
- Göreve, hazır küt/serilere ve tamamlanmaya yakın gruplara göre otomatik el dizme
- Kart çekme, ortaya atma, görev açma, gruba işleme ve joker değiştirme için doğrudan sürükle-bırak masa hareketleri
- Mobil bellek kullanımı için 300×420 boyutuna optimize edilmiş kart görselleri ve hafif masa gölgeleri
- Kalıcı oyuncu adı, avatar, seviye, maç ve galibiyet istatistikleri
- Arkadaş kodu, arkadaşlık istekleri, çevrim içi durumu, açık arkadaş masasına katılma ve 10 dakikalık masa davetleri
- Hemen Oyna ile en eski uygun açık masayı dolduran, gerekirse geçici yeni masa oluşturan hızlı eşleşme
- Çevrim içi masaya otomatik dönüş, bağlantı durumu ve sunucu kontrollü 45 saniyelik sıra süresi
- Maç sonunda aynı oyuncularla tek dokunuşla yeniden oynama
- Kart çekme, grup hazırlama, yere açma ve kart atma akışı
- El sonu ceza puanları ve oyun sonu sıralaması

## Mimari

Oyun kuralları `src/game` altında arayüzden bağımsızdır; botlar ve sunucu aynı motoru kullanır.

## Arkadaş odaları

Üretim altyapısı Supabase Auth, Postgres, Realtime ve `room` Edge Function'ını kullanır.
`.env.example` dosyasındaki iki public değer `.env.local` içine eklenmelidir. Service-role
anahtarı mobil uygulamaya veya GitHub'a kesinlikle eklenmez.

Veritabanı migration'ları ve kurulum notları `supabase/` altındadır. Oyuncular hesap
formu görmeden anonim bir Supabase kimliği alır. RLS sayesinde yalnızca üye oldukları
odayı okuyabilirler; rakip elleri ve kapalı deste istemcinin okuyamadığı `room_states`
tablosunda tutulur. Hamleler Edge Function içinde ortak oyun motoruyla doğrulanır.
Revision kontrolü aynı anda gelen hamlelerin birbirini ezmesini engeller ve Realtime
özel oda kanalındaki değişiklikleri üyelere bildirir.

`social` Edge Function'ı arkadaş grafiğini özel tutar. Yalnızca kabul edilmiş arkadaşlar
birbirinin çevrim içi durumunu ve bekleyen, dolmamış masasını görebilir. Masa davetleri
10 dakika sonra sona erer. Bağlı oyuncusu olan bekleme odaları açık kalır; tamamen boş
kalan odalar 5 dakika sonra temizlenir. Başlamış oyunlara sonradan oyuncu alınmaz ve
her hamlede 24 saatlik geri dönüş süresi yenilenir.

`server/` altındaki eski WebSocket + SQLite sunucusu yalnızca yerel referans ve geriye
dönüş seçeneği olarak korunmaktadır; mobil istemci artık onu kullanmaz.

## Giriş (e-posta, Google, Apple)

Ana ekrandaki **Giriş yap** bağlantısı `src/app/login.tsx` ekranını açar; giriş yapmak
zorunlu değildir, misafir/anonim oyun akışı aynen çalışmaya devam eder. Hesap açan
oyuncunun kimliği (`src/network/auth.ts`) aynı Supabase Auth oturumunu kullandığı için
`connectRoom` çevrim içi masalarda da otomatik olarak bu hesabı kullanır.

- **E-posta/parola**: kayıt, giriş, e-posta doğrulama ve uygulama içinden parola
  yenileme desteklenir. Supabase Dashboard > Authentication > URL Configuration
  bölümündeki Redirect URLs listesine `amerikano://**` ekle. Misafir oyuncu kayıt
  olduğunda mevcut profil kimliği korunur.
- **Apple ile giriş** (yalnızca iOS): `expo-apple-authentication` + Supabase
  `signInWithIdToken`. Apple Developer hesabında "Sign in with Apple" özelliğini aç,
  Supabase Dashboard > Authentication > Providers > Apple'ı etkinleştir.
  `app.json` içinde `ios.usesAppleSignIn` ve `expo-apple-authentication` eklentisi zaten
  tanımlı.
- **Google ile giriş** (iOS + Android): `@react-native-google-signin/google-signin` +
  Supabase `signInWithIdToken`. Google Cloud Console'da bir "Web application" (webClientId)
  ve gerekiyorsa bir "iOS" (iosClientId) OAuth istemcisi oluştur; bu ID'leri
  `.env.local` içine `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
  olarak ekle, webClientId'yi Supabase Dashboard > Authentication > Providers > Google'a da
  gir. `app.config.ts`, iOS URL şemasını iOS Client ID'den EAS derlemesi sırasında
  otomatik üretir. Eksik yapılandırmada Google düğmesi gösterilmez.

- **Misafir hesabını yükseltme**: Supabase Dashboard > Authentication > Providers
  bölümünde **Enable Manual Linking** seçeneğini aç. Böylece Apple/Google ile devam
  eden misafirin seviyesi ve istatistikleri yeni hesabında kalır.
- **Hesap silme**: `delete-account` Edge Function'ını yayınla. Apple ile giriş yapanların
  Apple yetkisini de kaldırabilmek için `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
  `APPLE_PRIVATE_KEY` ve isteğe bağlı `APPLE_CLIENT_ID` (`com.hegionsoft.amerikano`)
  değerlerini yalnızca Supabase Edge Function secrets olarak tanımla. `.p8` anahtarını
  projeye veya `EXPO_PUBLIC_` değişkenlerine koyma.

Bu iki native modül **Expo Go'da çalışmaz**; test etmek için `npx expo prebuild` ile
oluşturulan yerel proje veya bir EAS development build (`eas build --profile development`)
gerekir. Kimlik bilgileri girilmeden Google/Apple butonlarına basılırsa kullanıcıya
anlaşılır bir hata mesajı gösterilir, uygulama çökmez.

## Kontroller

`npm test`, `npm run typecheck`, `npm run lint`.
Yayınlanan Supabase oda akışının kısa kontrolü için `node scripts/smoke-supabase.mjs`
kullanılabilir; test geçici odasını tamamlandığında siler.

Kaynak kart görselleri değiştirilirse mobil boyutları yeniden üretmek için
`powershell -ExecutionPolicy Bypass -File scripts/optimize-card-assets.ps1` çalıştırılabilir.
