import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';

import HomeScreen from './index';
import { handleAuthLink } from '@/network/auth';

// Supabase e-mail callbacks still target /login for backward compatibility.
// The user sees the unified entry screen while the callback is processed, then
// the route is normalized back to the home screen.
export default function AuthCallbackScreen() {
  const incomingUrl = Linking.useLinkingURL();

  useEffect(() => {
    let active = true;
    void (async () => {
      const url = incomingUrl ?? await Linking.getInitialURL();
      if (url) await handleAuthLink(url);
      if (active) router.replace('/');
    })();
    return () => { active = false; };
  }, [incomingUrl]);

  return <HomeScreen />;
}
