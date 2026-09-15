# Amerikano — oyunumuzun kural kaydı

Esas: kullanıcının verdiği kurallar ve son düzeltmesi. 12 el düzeni korunur.
Joker kuralı değişmez: ilk 5 elde açılışta yasak, 6. elden itibaren serbest.
Bu, uygulamamızın seçilmiş kural setidir; evrensel bir standart iddiası değildir.

## 12 el (mevcut sıralama korunmuştur)

| El | Açılış görevi |
| --- | --- |
| 1 | Bir üçlü küt |
| 2 | Bir üçlü seri |
| 3 | İki üçlü küt |
| 4 | İki üçlü seri |
| 5 | Bir üçlü küt + bir üçlü seri |
| 6 | Bir dörtlü küt |
| 7 | Bir dörtlü seri |
| 8 | İki dörtlü küt |
| 9 | İki dörtlü seri |
| 10 | Bir dörtlü küt + bir dörtlü seri |
| 11 | Bir beşli seri |
| 12 | Elden bitme: bütün el tek hamlede açılır ve bitiş kartı kapalı atılır |

## Oynanış

- 2 standart deste ve 2 joker, toplam 106 benzersiz fiziksel kart.
- Çevrim içi arkadaş odaları 2–6, aynı cihaz modu 3–6 oyuncuyu destekler; klasik oyun 3–5 kişi için idealdir.
- Her oyuncuya 13, başlangıç oyuncusuna 14 kart verilir. Başlangıç oyuncusu kart çekmez.
- Kapalı destenin yanında bir açık kart bulunur. Dijital dağıtım karıştırmayı otomatik yapar.
- Koltuk dizisi saat yönünde kabul edilir; sıra ters yönde ilerler.
  Başlangıç oyuncusunun solundaki koltuk dağıtıcıdır. Her el dağıtıcı ve başlangıç koltuğu
  aynı yönde birer yer ilerler; önceki elin kazananı bunu değiştirmez.
- Sıradaki oyuncu açık kartı doğrudan alabilir veya kapalı desteyi seçebilir.
- Kapalı deste seçildiğinde diğer oyuncular açık kartı isteyebilir. Alan oyuncu
  açık kartı ve desteden bir kapalı ceza kartını eline ekler; sırası değişmez.
- Çakışan istekler için uygulama tercihi: diğer oyunculara oyun yönünde sırayla
  al/pas seçeneği sunulur. İlk alanın ardından teklif kapanır. Herkes pas geçerse
  açık kart yerde kalır. Ardından asıl sıradaki oyuncu kapalı kartını çeker.
- Çevrim içi karar süresi kişi başına 8 saniyedir; sunucu süresi dolanı pas geçirir.
  Yerel modda insan oyuncu al/pas seçeneğine basar; botlar otomatik karar verir.
- Ceza kartını ve asıl oyuncunun kartını karşılayacak iki kapalı kart yoksa
  önce eski atıklar (en üst açık kart hariç) karıştırılır. Yine yetersizse ceza teklifi
  açılmaz; mevcut tek kapalı kart normal çekilir.
- Küt: aynı değer, farklı semboller; 3–4 kart. Aynı sembolün iki kopyası aynı kütte olmaz.
- Seri: aynı sembolden ardışık 3–13 kart. As yalnızca yüksek: Q-K-A geçerli,
  A-2-3 ve K-A-2 geçersiz. Joker eksik kartın yerini tutar.
- Kendi görevini daha önce açmış oyuncu, yerdeki jokeri tam karşılık kartıyla
  değiştirebilir ve jokeri eline alabilir. Seride kartın sembolü ve eksik değeri
  tam uymalıdır (Sinek 7–Joker–Sinek 9 için Sinek 8). Kütte aynı değerin grupta
  bulunmayan sembollerinden biri kullanılabilir. Açtığı turun içinde bu işlem yapılamaz.
- İlk açılışta yalnızca o elin zorunlu grupları ve tam uzunlukları açılır.
  Açılıştan sonraki sıralarda ek grup açma ve tüm oyuncuların gruplarına işleme serbesttir.
- İlk sıra döngüsünü bekleme şartı yoktur.
- Bitmek için bir kart kapalı atılır. Finalde kısmi açılış yapılamaz:
  tüm gruplar ve bitiş kartı sunucuda tek atomik hamle olarak doğrulanır.
- Ceza puanları: joker 25, As 11, J/Q/K 10, sayılar kendi değeri.
  Açmamış oyuncuya ek sabit ceza uygulanmaz. 12 el sonunda en düşük toplam kazanır;
  eşitlik varsa ortak kazanan gösterilir.

Tek oyunculu, aynı cihaz ve çevrim içi odalar aynı kural motorunu kullanır.
Kural sürümü: amerikano-12-v2. Eski sürüm odaları diskte korunur ancak bu sürümde
devam ettirilmez; yeni oda açılmalıdır.
