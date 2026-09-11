# Amerikano

iOS ve Android için Expo + React Native Amerikano: botlara karşı tek oyunculu,
3–6 kişilik aynı cihaz modu ve kodla katılınan çevrim içi arkadaş odaları.
Klasik resimli kartların CC0 lisansı ve kaynağı assets/cards altında bulunur.

## Çalıştırma

Gereksinimler: Node.js 24 ve SDK 57 uyumlu Expo geliştirme ortamı.

```bash
npm install
npm start
```

Terminalde görünen QR kodunu Expo Go ile tarayın. Android emülatörü için `npm run android`; macOS üzerindeki iOS simülatörü için `npm run ios` kullanılabilir.

## İlk sürümde olanlar

- 3–6 oyunculu aynı cihaz modu
- Mevcut 12 el ve açılış görevleri (ayrıntılar: [RULES.md](RULES.md))
- 106 kartlık deste, seri/küt ve joker doğrulaması
- İlk beş elde açılışta joker yasağı; yalnızca yüksek As
- 14/13 dağıtım, ters yönde sıra, ceza kartıyla sıra dışı alma
- Açılış sırası işleme kilidi, atomik final ve kapalı bitiş kartı
- Tek oyunculu oyunu cihazda otomatik saklama, devam etme veya yeni oyun başlatma
- Kart çekme, atma, açma, joker ve kazanma için özgün kısa sesler; kalıcı sessize alma
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

`server/` altındaki eski WebSocket + SQLite sunucusu yalnızca yerel referans ve geriye
dönüş seçeneği olarak korunmaktadır; mobil istemci artık onu kullanmaz.

## Kontroller

`npm test`, `npm run typecheck`, `npm run lint`.
Yayınlanan Supabase oda akışının kısa kontrolü için `node scripts/smoke-supabase.mjs`
kullanılabilir; test geçici odasını tamamlandığında siler.
