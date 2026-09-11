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
- Kart çekme, grup hazırlama, yere açma ve kart atma akışı
- El sonu ceza puanları ve oyun sonu sıralaması

## Mimari

Oyun kuralları `src/game` altında arayüzden bağımsızdır; botlar ve sunucu aynı motoru kullanır.

## Arkadaş odaları

İkinci terminalde `npm run server` çalıştırın (varsayılan port 8090).
Geliştirmede istemci Expo sunucusunun adresini kullanır; telefonlar aynı ağda olmalıdır.
İnternet erişimi için sunucunun ayrıca barındırılması ve TLS kurulması gerekir:
`EXPO_PUBLIC_ROOM_SERVER=wss://sunucunuz` ile istemciyi yeniden derleyin.
Bu depo henüz herkese açık bir sunucuya veya mağazalara yayımlanmamıştır.

Sunucu SQLite'a odaları kaydeder; kart dağıtımı ve hamleler sunucu otoritesindedir.
Rakip eller ve kapalı deste istemcilere gönderilmez. Yeniden bağlanma oturumu,
hamle tekrarı engeli ve sürüm kontrolü vardır. Çevrim içi ceza teklifi zaman aşımı
sunucuda uygulanır. Bağlantısı kesilen asıl sıra oyuncusunun yerine henüz bot geçmez.
PORT, ROOM_DB ve ALLOWED_ORIGINS ortam değişkenleri desteklenir.
Sunucu için `server/Dockerfile` bulunur; üretimde SQLite verisini kalıcı diske bağlayın.

## Kontroller

`npm test`, `npm run typecheck`, `npm run lint`.
Testler kural motorunu ve gerçek WebSocket istemcileriyle oda/yeniden bağlanma akışını kapsar.
