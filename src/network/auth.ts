import type { Session, User } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { parseAuthLink } from './auth-links';
import { isSupabaseConfigured, supabase } from './supabase';

type State = {
  status: 'loading' | 'signed-out' | 'signed-in';
  user: User | null;
  busy: boolean;
  error: string;
  info: string;
  recovery: boolean;
};

let snapshot: State = { status: 'loading', user: null, busy: false, error: '', info: '', recovery: false };
const listeners = new Set<() => void>();
const handledLinks = new Set<string>();

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
  supabase.auth.onAuthStateChange((event, session) => {
    update({
      status: statusFor(session),
      user: session?.user ?? null,
      busy: false,
      recovery: event === 'PASSWORD_RECOVERY' ? true : event === 'SIGNED_OUT' ? false : snapshot.recovery,
    });
  });
} else {
  snapshot = { status: 'signed-out', user: null, busy: false, error: '', info: '', recovery: false };
}

const configuredValue = (value: string | undefined) => Boolean(value && !value.startsWith('REPLACE_WITH') && !value.includes('placeholder'));
export const googleSignInConfigured = configuredValue(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)
  && (Platform.OS !== 'ios' || configuredValue(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID));

function redirectTo(flow: 'signup' | 'upgrade' | 'recovery') {
  return Linking.createURL('login', { queryParams: { flow } });
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

export function handleAuthLink(url: string) {
  if (handledLinks.has(url)) return Promise.resolve();
  const payload = parseAuthLink(url);
  if (!payload) return Promise.resolve();
  handledLinks.add(url);

  return run(async () => {
    if (payload.error) throw new Error(decodeURIComponent(payload.error.replace(/\+/g, ' ')));
    if (payload.code) {
      const { error } = await supabase!.auth.exchangeCodeForSession(payload.code);
      if (error) throw error;
    } else if (payload.accessToken && payload.refreshToken) {
      const { error } = await supabase!.auth.setSession({
        access_token: payload.accessToken,
        refresh_token: payload.refreshToken,
      });
      if (error) throw error;
    } else {
      throw new Error('Giriş bağlantısı eksik veya süresi dolmuş. Yeniden bağlantı iste.');
    }

    const recovery = payload.type === 'recovery' || payload.flow === 'recovery';
    update({
      recovery,
      info: recovery
        ? 'Şimdi yeni parolanı oluşturabilirsin.'
        : payload.flow === 'upgrade'
          ? 'E-posta adresin doğrulandı; misafir ilerlemen hesabına aktarıldı.'
          : 'E-posta adresin doğrulandı. Hesabın hazır.',
    });
  });
}

export function signInWithEmail(email: string, password: string) {
  return run(async () => {
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  });
}

export function signUpWithEmail(email: string, password: string) {
  return run(async () => {
    const normalizedEmail = email.trim();
    const { data: sessionData, error: sessionError } = await supabase!.auth.getSession();
    if (sessionError) throw sessionError;

    if (sessionData.session?.user.is_anonymous) {
      const { error } = await supabase!.auth.updateUser(
        { email: normalizedEmail, password },
        { emailRedirectTo: redirectTo('upgrade') },
      );
      if (error) throw error;
      update({ info: 'Doğrulama bağlantısını e-postana gönderdik. Misafir ilerlemen korunacak.' });
      return;
    }

    const { data, error } = await supabase!.auth.signUp({
      email: normalizedEmail,
      password,
      options: { emailRedirectTo: redirectTo('signup') },
    });
    if (error) throw error;
    if (data.user && !data.session) update({ info: 'Hesabını onaylamak için e-postana gönderilen bağlantıya tıkla.' });
  });
}

export function requestPasswordReset(email: string) {
  return run(async () => {
    const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: redirectTo('recovery'),
    });
    if (error) throw error;
    update({ info: 'Parola yenileme bağlantısını e-postana gönderdik.' });
  });
}

export function updatePassword(password: string) {
  return run(async () => {
    const { error } = await supabase!.auth.updateUser({ password });
    if (error) throw error;
    update({ recovery: false, info: 'Parolan yenilendi. Hesabına giriş yapıldı.' });
  });
}

export function signInWithApple() {
  return run(async () => {
    if (Platform.OS !== 'ios') throw new Error('Apple ile giriş yalnızca iOS cihazlarda kullanılabilir.');
    const AppleAuthentication = await import('expo-apple-authentication');
    const nonce = Crypto.randomUUID();
    let credential;
    try {
      credential = await AppleAuthentication.signInAsync({
        nonce,
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
    const { data: sessionData, error: sessionError } = await supabase!.auth.getSession();
    if (sessionError) throw sessionError;
    const credentials = { provider: 'apple' as const, token: credential.identityToken, nonce };
    const { error } = sessionData.session?.user.is_anonymous
      ? await supabase!.auth.linkIdentity(credentials)
      : await supabase!.auth.signInWithIdToken(credentials);
    if (error) throw error;
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
    if (fullName) await supabase!.auth.updateUser({ data: { full_name: fullName } });
  });
}

export function signInWithGoogle() {
  return run(async () => {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    if (!googleSignInConfigured || !webClientId) {
      throw new Error('Google girişi henüz yapılandırılmadı.');
    }
    const { GoogleSignin, isSuccessResponse } = await import('@react-native-google-signin/google-signin');
    GoogleSignin.configure({ webClientId, iosClientId: iosClientId || undefined });
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return;
    const idToken = response.data.idToken;
    if (!idToken) throw new Error('Google kimlik doğrulaması tamamlanamadı.');
    const { accessToken } = await GoogleSignin.getTokens();
    const { data: sessionData, error: sessionError } = await supabase!.auth.getSession();
    if (sessionError) throw sessionError;
    const credentials = { provider: 'google' as const, token: idToken, access_token: accessToken };
    const { error } = sessionData.session?.user.is_anonymous
      ? await supabase!.auth.linkIdentity(credentials)
      : await supabase!.auth.signInWithIdToken(credentials);
    if (error) throw error;
  });
}

export function signOut() {
  return run(async () => {
    const { error } = await supabase!.auth.signOut();
    if (error) throw error;
  });
}

export function deleteAccount() {
  return run(async () => {
    const user = snapshot.user;
    if (!user) throw new Error('Silinecek hesap bulunamadı.');
    const providers = new Set<string>([
      ...(Array.isArray(user.app_metadata.providers) ? user.app_metadata.providers : []),
      ...(user.app_metadata.provider ? [user.app_metadata.provider] : []),
    ]);
    let appleAuthorizationCode: string | undefined;

    if (providers.has('apple') && Platform.OS === 'ios') {
      const AppleAuthentication = await import('expo-apple-authentication');
      try {
        const credential = await AppleAuthentication.signInAsync();
        appleAuthorizationCode = credential.authorizationCode ?? undefined;
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') {
          throw new Error('Hesap silme işlemi iptal edildi.');
        }
        throw error;
      }
      if (!appleAuthorizationCode) throw new Error('Apple doğrulaması tamamlanamadı.');
    }

    const { error } = await supabase!.functions.invoke('delete-account', {
      body: { appleAuthorizationCode },
    });
    if (error) throw new Error(await functionError(error));

    if (providers.has('google')) {
      try {
        const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
        await GoogleSignin.revokeAccess();
      } catch { /* The server-side account deletion has already succeeded. */ }
    }
    await supabase!.auth.signOut({ scope: 'local' });
    update({ status: 'signed-out', user: null, recovery: false, info: 'Hesabın ve profil verilerin silindi.' });
  });
}

async function functionError(error: unknown) {
  if (error && typeof error === 'object' && 'context' in error) {
    try {
      const response = (error as { context: Response }).context;
      const body = await response.clone().json() as { error?: string };
      if (body.error) return body.error;
    } catch { /* Fall back to the SDK message. */ }
  }
  return error instanceof Error ? error.message : 'Hesap silinemedi.';
}

export function clearAuthError() { update({ error: '', info: '' }); }
