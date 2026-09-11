import type { Session, User } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { isSupabaseConfigured, supabase } from './supabase';

type State = { status: 'loading' | 'signed-out' | 'signed-in'; user: User | null; busy: boolean; error: string; info: string };

let snapshot: State = { status: 'loading', user: null, busy: false, error: '', info: '' };
const listeners = new Set<() => void>();

function update(patch: Partial<State>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const useAuth = () => useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

function statusFor(session: Session | null): State['status'] {
  if (!session || session.user.is_anonymous) return 'signed-out';
  return 'signed-in';
}

if (supabase) {
  void supabase.auth.getSession().then(({ data }) => {
    update({ status: statusFor(data.session), user: data.session?.user ?? null });
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    update({ status: statusFor(session), user: session?.user ?? null, busy: false });
  });
} else {
  snapshot = { status: 'signed-out', user: null, busy: false, error: '', info: '' };
}

function authErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (/invalid login credentials/i.test(error.message)) return 'E-posta veya parola hatalı.';
    if (/already registered/i.test(error.message)) return 'Bu e-posta zaten kayıtlı. Giriş yapmayı dene.';
    if (/password/i.test(error.message) && /least/i.test(error.message)) return 'Parola en az 6 karakter olmalı.';
    return error.message;
  }
  return 'Bir şeyler ters gitti.';
}

async function run(action: () => Promise<void>) {
  if (!supabase || !isSupabaseConfigured) {
    update({ error: 'Supabase bağlantısı yapılandırılmadı.' });
    return;
  }
  update({ busy: true, error: '', info: '' });
  try {
    await action();
  } catch (error) {
    update({ error: authErrorMessage(error) });
  } finally {
    update({ busy: false });
  }
}

export function signInWithEmail(email: string, password: string) {
  return run(async () => {
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  });
}

export function signUpWithEmail(email: string, password: string) {
  return run(async () => {
    const { data, error } = await supabase!.auth.signUp({ email: email.trim(), password });
    if (error) throw error;
    if (data.user && !data.session) update({ info: 'Hesabını onaylamak için e-postana gönderilen bağlantıya tıkla.' });
  });
}

export function signInWithApple() {
  return run(async () => {
    if (Platform.OS !== 'ios') throw new Error('Apple ile giriş yalnızca iOS cihazlarda kullanılabilir.');
    const AppleAuthentication = await import('expo-apple-authentication');
    let credential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') return;
      throw error;
    }
    if (!credential.identityToken) throw new Error('Apple kimlik doğrulaması tamamlanamadı.');
    const { error } = await supabase!.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) throw error;
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
    if (fullName) await supabase!.auth.updateUser({ data: { full_name: fullName } });
  });
}

export function signInWithGoogle() {
  return run(async () => {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    if (!webClientId || webClientId.startsWith('REPLACE_WITH')) {
      throw new Error('Google girişi henüz yapılandırılmadı (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID eksik).');
    }
    const { GoogleSignin, isSuccessResponse } = await import('@react-native-google-signin/google-signin');
    GoogleSignin.configure({ webClientId, iosClientId: iosClientId || undefined });
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return;
    const idToken = response.data.idToken;
    if (!idToken) throw new Error('Google kimlik doğrulaması tamamlanamadı.');
    const { error } = await supabase!.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) throw error;
  });
}

export function signOut() {
  return run(async () => {
    const { error } = await supabase!.auth.signOut();
    if (error) throw error;
  });
}

export function clearAuthError() { update({ error: '', info: '' }); }
