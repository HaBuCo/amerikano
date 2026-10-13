# Kart değeri tanıma modeli

Skor tutucunun kamera özelliği için, fotoğraftaki kartların köşesindeki değeri
(Joker, A, K, Q, J, 10…2) bulan küçük bir YOLO modeli. Takım öğretilmez; puan
için değer yeterli. Her kartın iki köşesi ayrı ayrı bulunur.

Veri, kod ve eğitim çıktıları burada; `data/`, `runs/`, `.venv/` git dışında.

## Kurulum

NVIDIA GPU ve [uv](https://docs.astral.sh/uv/) gerekir.

```
cd ml/card-detector
uv sync
```

## 1. Desteler

Her deste `data/decks/<ad>/` altında, kart başına bir dik kırpılmış yüz
görüntüsü. Dosya adı değerle başlar (`K_maca.png`, `10-kupa.jpg`, `joker.png`).

- Uygulamanın CC0 destesi: `uv run python prepare_app_deck.py`
- Fotoğraftan deste: her kartın tek tek fotoğrafını `data/photos/kartlar/`
  içine koy, `data/photos/etiketler.json` dosyasında her fotoğrafın değerini yaz
  (`{"foto.jpeg": "K"}`), sonra:

  ```
  uv run python prepare_photos.py data/photos/kartlar data/decks/<ad> \
      --labels data/photos/etiketler.json --corners data/photos/elle_koseler.json
  ```

  Kartı otomatik bulamadığı ya da yanlış kırptığı fotoğraflar için
  `elle_koseler.json` dosyasına 4 köşe noktası yazılır. Fotoğraftan gelen
  destelerde değer kutusu otomatik bulunmak yerine `deste.json` ile sabitlenir
  (`{"corner": [x0, y0, x1, y1], "joker_corner": [...]}`, 300x420 ölçeğinde).

## 2. Sentetik veri ve eğitim

```
uv run python generate.py --train 12000 --val 1200
uv run python train.py --epochs 50 --name v1
```

`generate.py` kartları rastgele zeminlere yelpaze, sıra, ızgara ya da dağınık
dizer; perspektif, gölge, parlama, bulanıklık ve JPEG bozulması ekler. Köşesinin
%80'inden azı görünen değerler etiketlenmez. `data/backgrounds/` altına gerçek
masa fotoğrafları konursa zeminlerin bir kısmı onlardan seçilir.

## 3. Gerçek fotoğraflarla ölçüm

```
uv run python make_photo_testset.py data/photos/kartlar data/real/tek-kart \
    --labels data/photos/etiketler.json --corners data/photos/elle_koseler.json \
    --deck data/photos/deste.json
uv run yolo val model=runs/v1/weights/best.pt data=data/real/tek-kart/data.yaml
```

Bu set eğitimde kullanılan kartların kendisinden yapıldığı için iyimserdir; asıl
ölçüm masaya açılmış gerçek el fotoğraflarıyla yapılmalı.
