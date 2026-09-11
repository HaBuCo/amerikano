import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { palette } from '@/constants/palette';

export default function RootLayout() {
  return (
    <>
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
        <Stack.Screen name="rules" options={{ title: 'Nasıl Oynanır' }} />
        <Stack.Screen name="game" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="online" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
