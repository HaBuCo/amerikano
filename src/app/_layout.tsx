import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { palette } from '@/constants/palette';
import { GameSoundsProvider } from '@/audio/game-sounds';
import { GameSettingsProvider } from '@/settings/game-settings';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { installGlobalErrorHandler } from '@/monitoring/error-reporting';

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
  return (
    <SafeAreaProvider initialMetrics={safeWindowMetrics()}>
    <AppErrorBoundary><GameSettingsProvider><GameSoundsProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.felt },
          headerTintColor: palette.cream,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: palette.felt },
          headerBackButtonDisplayMode: 'minimal',
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="setup" options={{ title: 'Oyunu Kur' }} />
        <Stack.Screen name="single-setup" options={{ title: 'Tek Oyunculu' }} />
        <Stack.Screen name="rules" options={{ title: 'Nasıl Oynanır' }} />
        <Stack.Screen name="game" options={{ headerShown: false, gestureEnabled: false, fullScreenGestureEnabled: false }} />
        <Stack.Screen name="online" options={{ headerShown: false, gestureEnabled: false, fullScreenGestureEnabled: false }} />
        <Stack.Screen name="friends" options={{ headerShown: false }} />
        <Stack.Screen name="stats" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack>
    </GameSoundsProvider></GameSettingsProvider></AppErrorBoundary>
    </SafeAreaProvider>
  );
}
