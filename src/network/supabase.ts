import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.EXPO_PUBLIC_SUPABASE_KEY;
const serverRendering = Platform.OS === 'web' && typeof window === 'undefined';

export const supabase = url && publishableKey
  ? createClient(url, publishableKey, {
      auth: {
        // AsyncStorage's web adapter reads `window`. Expo Router also evaluates
        // this module in Node while pre-rendering, so web uses Supabase's guarded
        // localStorage adapter and server rendering keeps no session at all.
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        autoRefreshToken: !serverRendering,
        persistSession: !serverRendering,
        detectSessionInUrl: false,
      },
    })
  : null;

export const isSupabaseConfigured = Boolean(supabase);

if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', state => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
