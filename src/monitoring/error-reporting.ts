import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/network/supabase';

type ErrorUtilsLike = {
  getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
  setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

let installed = false;

export async function reportError(error: unknown, context: string, fatal = false) {
  const normalized = error instanceof Error ? error : new Error(String(error));
  if (__DEV__) console.error(`[${context}]`, normalized);
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await supabase.functions.invoke('telemetry', {
      body: {
        context: context.slice(0, 80),
        message: normalized.message.slice(0, 500),
        stack: normalized.stack?.slice(0, 4_000),
        fatal,
        platform: Platform.OS,
        appVersion: Constants.expoConfig?.version ?? 'unknown',
      },
    });
  } catch {
    // Reporting failures must never create another user-facing failure.
  }
}

export function installGlobalErrorHandler() {
  if (installed) return;
  installed = true;
  const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;
  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error, isFatal) => {
    void reportError(error, 'global-js', Boolean(isFatal));
    previous?.(error, isFatal);
  });
}
