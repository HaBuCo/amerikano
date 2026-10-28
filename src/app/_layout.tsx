import { useTranslations } from '@/i18n/language';
import { useCallback, useEffect, useState } from 'react';
import { IntroSplash } from '@/components/intro-splash';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, Pressable, Text } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { palette } from '@/constants/palette';
import { GameSoundsProvider } from '@/audio/game-sounds';
import { GameSettingsProvider } from '@/settings/game-settings';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { installGlobalErrorHandler } from '@/monitoring/error-reporting';
import { initializeAds } from '@/ads/mobile-ads';
import { preloadInterstitial } from '@/ads/interstitial';
import { hasRemovedAds, hasStorePurchases, identifyPurchaser, initializePurchases } from '@/purchases/purchases';
import { refreshInventory, syncPurchases } from '@/network/store';
import { preloadCardArt } from '@/constants/preload-card-art';
import { useAuth } from '@/network/auth';
import { refreshOnlinePlayerCount, resetOnlinePlayerCount } from '@/network/presence';
import { NotificationBridge } from '@/notifications/notification-bridge';

installGlobalErrorHandler();

const fallbackMetrics = {
  frame: { x: 0, y: 0, width: 1, height: 1 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function safeWindowMetrics() {
  const metrics = initialWindowMetrics;
  if (!metrics || metrics.frame.width < 1 || metrics.frame.height < 1) return fallbackMetrics;
  const inset = (value: number) => Number.isFinite(value) && value >= 0 ? value : 0;
  return {
    frame: metrics.frame,
    insets: {
      top: inset(metrics.insets.top),
      left: inset(metrics.insets.left),
      right: inset(metrics.insets.right),
      bottom: inset(metrics.insets.bottom),
    },
  };
}

export default function RootLayout() {
  const { t } = useTranslations();
  const auth = useAuth();
  // The animated opening plays once per cold start, over whatever screen loads beneath it.
  const [introOpen, setIntroOpen] = useState(true);
  const closeIntro = useCallback(() => setIntroOpen(false), []);
  useEffect(() => {
    preloadCardArt();
    void initializePurchases().then(() => {
      if (hasRemovedAds()) return;
      void initializeAds().then(() => preloadInterstitial());
    });
  }, []);

  // Link store purchases to the Supabase account, then credit anything an
  // interrupted purchase left uncredited (the server ignores repeats).
  useEffect(() => {
    const userId = auth.status === 'anonymous' || auth.status === 'signed-in' ? auth.user?.id ?? null : null;
    void refreshInventory();
    void identifyPurchaser(userId).then(() => {
      if (userId && hasStorePurchases()) void syncPurchases().catch(() => undefined);
    });
  }, [auth.status, auth.user?.id]);

  useEffect(() => {
    resetOnlinePlayerCount();
    if (auth.status !== 'anonymous' && auth.status !== 'signed-in') return;
    const refresh = () => {
      if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') {
        void refreshOnlinePlayerCount();
      }
    };
    refresh();
    const timer = setInterval(refresh, 30_000);
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => { clearInterval(timer); appState.remove(); };
  }, [auth.status, auth.user?.id]);

  return (
    <SafeAreaProvider initialMetrics={safeWindowMetrics()}>
    <KeyboardProvider>
    <AppErrorBoundary><GameSettingsProvider><GameSoundsProvider>
      <StatusBar style="light" />
      <NotificationBridge />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.felt },
          headerTintColor: palette.cream,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: palette.felt },
          headerBackVisible: false,
          headerLeft: () => <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ paddingVertical: 9, paddingRight: 16 }}>
            <Text style={{ color: palette.cream, fontSize: 15, fontWeight: '700' }}>{t('Geri')}</Text>
          </Pressable>,
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="setup" options={{ headerShown: false }} />
        <Stack.Screen name="single-setup" options={{ headerShown: false }} />
        <Stack.Screen name="rules" options={{ headerShown: false }} />
        <Stack.Screen name="lessons" options={{ headerShown: false }} />
        <Stack.Screen name="lesson" options={{ headerShown: false, gestureEnabled: false, fullScreenGestureEnabled: false }} />
        <Stack.Screen name="game" options={{ headerShown: false, gestureEnabled: false, fullScreenGestureEnabled: false }} />
        <Stack.Screen name="online" options={{ headerShown: false, gestureEnabled: false, fullScreenGestureEnabled: false }} />
        <Stack.Screen name="friends" options={{ headerShown: false }} />
        <Stack.Screen name="stats" options={{ headerShown: false }} />
        <Stack.Screen name="score-keeper" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="store" options={{ headerShown: false }} />
      </Stack>
      {introOpen && <IntroSplash onDone={closeIntro} />}
    </GameSoundsProvider></GameSettingsProvider></AppErrorBoundary>
    </KeyboardProvider>
    </SafeAreaProvider>
  );
}
