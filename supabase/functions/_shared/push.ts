import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type PushLanguage = 'tr' | 'en';
export type PushTarget = { token: string; language: string };
export type PushText = { title: string; body: string };
/** Routes the app may open from a notification tap. Anything else is ignored client-side. */
export type PushRoute = '/friends' | '/online?quick=1';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function tokensFor(admin: SupabaseClient, userIds: string[]): Promise<PushTarget[]> {
  if (!userIds.length) return [];
  const { data, error } = await admin.from('push_tokens').select('token, language').in('user_id', userIds);
  if (error) {
    console.error('Could not read push tokens', error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Best effort: a failed push must never fail the game action that caused it.
 * Tokens Expo reports as unregistered are deleted so they are not retried.
 */
export async function sendPush(
  admin: SupabaseClient,
  targets: PushTarget[],
  text: (language: PushLanguage) => PushText,
  route: PushRoute,
) {
  if (!targets.length) return;
  const messages = targets.map(({ token, language }) => ({
    to: token,
    ...text(language === 'en' ? 'en' : 'tr'),
    data: { url: route },
    sound: 'default',
    channelId: 'default',
    priority: 'high',
  }));
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  try {
    for (let start = 0; start < messages.length; start += 100) {
      const batch = messages.slice(start, start + 100);
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        console.error('Expo push rejected', response.status);
        continue;
      }
      const { data } = await response.json() as { data?: { status: string; details?: { error?: string } }[] };
      const stale = (data ?? []).flatMap((ticket, index) =>
        ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' ? [batch[index].to] : []);
      if (stale.length) await admin.from('push_tokens').delete().in('token', stale);
    }
  } catch (error) {
    console.error('Expo push failed', error instanceof Error ? error.message : error);
  }
}
