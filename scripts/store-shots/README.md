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
