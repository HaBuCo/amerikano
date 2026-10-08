# English store images

Captures the English app from the web build and composes the App Store / Google Play
images into `store-assets/en/`. Supabase is blocked during capture and a local-only
guest session is used, so no accounts are created in production.

1. `copy scripts\store-shots\metro.config.web-shots.js metro.config.js`
2. `npx expo export --platform web` then `npx expo serve --port 8085`
3. In a scratch folder: `npm i playwright-core` (uses the installed Chrome)
4. `node gen-states.mts` (bot-played game states → `states.json`), then
   `node capture.mjs ../../store-assets/en/raw phone ipad`
   and move the `p0*` shots to `raw-phone/`, the `i0*` shots to `raw-ipad/`
5. `python scripts/store-shots/compose.py`
6. Delete `metro.config.js` and `dist/`

Captions live in `compose.py`. The Play feature graphic reuses helpers from the
untracked `store/build_feature.py`.
