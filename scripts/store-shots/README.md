# English store images

Captures the English app from the web build and composes the App Store / Google Play
images into `store-assets/en/`. Supabase is blocked during capture and a local-only
guest session is used, so no accounts are created in production.

1. `copy scripts\store-shots\metro.config.web-shots.js metro.config.js` (temporarily replaces the project config)
2. `npx expo export --platform web` then `npx expo serve --port 8085`
3. In a scratch folder: `npm i playwright-core` (uses the installed Chrome)
4. `node gen-states.mts` (bot-played game states → `states.json`), then
   `node capture.mjs ../../store-assets/en/raw phone ipad`
   and move the `p0*` shots to `raw-phone/`, the `i0*` shots to `raw-ipad/`
5. `python scripts/store-shots/compose.py`
6. Restore the project config with `git checkout metro.config.js` and delete `dist/`

Captions live in `compose.py`. The Play feature graphic reuses helpers from the
untracked `store/build_feature.py`.

## 1.2 screenshots (Turkish and English, new UI)

1. `npx expo start --web --port 8095`
2. `node gen-states.mts` (writes `states.json` next to it)
3. Add the temporary victory route: `src/app/preview-victory.tsx` renders
   `<VictoryCelebration visible ...>` on the felt after a 3.2 s delay, with
   `<Stack.Screen options={{ headerShown: false }} />`. Delete it after capturing.
4. From a folder with `playwright-core`, for each `lang` in `tr en` and group in `phone ipad`:
   `node capture-v12.mjs <captures>/<lang>-<group> <group> lang=<lang> states=<path to states.json>`
5. `python scripts/store-shots/compose-v12.py <captures>` → `store-assets/v1.2/<lang>/<device>/`

Captions live in `compose-v12.py`; every Supabase call is answered locally in `capture-v12.mjs`.

## Reels: "Amerikano nedir, nasıl oynanır?" (Turkish, 9:16, 15 s)

`reel/reel.html` is one pure function of time, so frames can be drawn in any order. Sound cues are written next to the motion they belong to.

1. Copy `reel/` to a scratch folder, `npm i playwright-core` there, and set `REPO` to this repository
2. `node render.mjs frames frames 8 8` (about 5 minutes, 3,600 JPEGs, delete them afterwards)
3. `node render.mjs cues audio/cues.json`, then `python audio.py audio/cues.json $REPO/assets/sounds audio` and `sh master.sh audio`
4. `sh encode.sh frames audio out`, then move the two MP4s to `store-assets/promo-video/tr/`

`node render.mjs stills out 0.6 4.5` draws a few frames for review; set `SAFE=1` to overlay Instagram's UI zones.
All music is synthesised in `audio.py`. Card and chip sounds and the card art are the app's own CC0 assets. Caption: `store-assets/promo-video/tr/instagram-reels.md`.

## Google Ads film: "Amerikano artık cebinde" (Turkish, 16:9, 1:1, 4:5, 9:16, 15 s and a 6 s bumper)

`ad/ad.html?fmt=<16x9|1x1|4x5|9x16>` works like the reel: one pure function of time, with a layout per format in `LAYOUTS`.
The phone screens are cut from `store-assets/v1.2/tr/ios-6.9/` (table, home, lesson), so recapture those first if the UI changes.
Frames run to 16 s: the bumper is the hook (0–2.5 s) cut straight to the end card (12.5–16 s).

1. Copy `ad/ad.html` and `ad/render.mjs` to a scratch folder, `npm i playwright-core` there, and set `REPO` to this repository
2. For each format: `node render.mjs frames <fmt> frames/<fmt> 8 10` (about 5 minutes and 3,840 JPEGs each, delete them afterwards)
3. `node render.mjs cues audio/cues.json`, then `python $REPO/scripts/store-shots/ad/soundtrack.py audio/cues.json $REPO/assets/sounds audio` and `sh $REPO/scripts/store-shots/reel/master.sh audio`
4. `sh $REPO/scripts/store-shots/ad/encode.sh frames audio out` writes the film and the bumper for every format; move them to `store-assets/promo-video/tr/google-ads/`

`node render.mjs stills <fmt> out 0.6 4.5` draws review frames; `SAFE=1` overlays the YouTube Shorts and in-stream UI zones.
`soundtrack.py` reuses the reel's synthesised voices from `reel/audio.py`. Ad copy and upload notes: `store-assets/promo-video/tr/google-ads/google-ads.md`.

## Google Ads film 2: "Herkes ekti mi?" (Turkish, real gameplay, 20 s and a 6 s bumper, four formats)

The phone in this film plays the real app, filmed from the web build on a virtual clock: `capture-play.mjs` replaces the page's
timers, clocks and animation frames before the app loads, so every animation is captured at exactly 30 fps at 1080x2340.

1. `node ad2/gen-ad-states.mts <scratch>/states-ad.json` finds the two moments to film by letting bots play seeded games
   (opening a set and a run in deal 5; going out in deal 12, with your score set to lead so the game ends in a win)
2. `npx expo start --web --port 8095`, copy `ad2/capture-play.mjs` to a scratch folder with `playwright-core`, and for each scene in
   `home open final` run `node capture-play.mjs states-ad.json <footage>/<scene> <scene>` (`probe-open` dumps screenshots and element positions instead).
   Taps and drags land where `marks.json` says; `film.html` uses those positions for the finger and the camera.
3. Download Inter (the app's typeface) next to an `inter.css` for the render, then copy `ad2/film.html` and `ad2/render.mjs` to the
   scratch folder and set `REPO`, `FOOTAGE=<footage>` and `FONTS=<inter.css>`. For each format: `node render.mjs frames <fmt> frames/<fmt> 8 10`
4. `node render.mjs cues audio/cues.json`, `python $REPO/scripts/store-shots/ad2/soundtrack.py audio/cues.json $REPO/assets/sounds audio`,
   `python $REPO/scripts/store-shots/ad2/master.py audio` (-14 LUFS)
5. `sh $REPO/scripts/store-shots/ad2/encode.sh frames audio out`, then move the MP4s to `store-assets/promo-video/tr/google-ads/`

Rooms filled with bots exist only for public quick tables, so the film says "Masa hep kurulu" (single player against bots is always
there) and never that the app fills a friends' room. No coins, entry fees or coin prizes appear on screen.
