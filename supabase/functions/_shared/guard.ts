import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const RATE_LIMITED_MESSAGE = 'Çok fazla deneme yaptın. Biraz bekleyip tekrar dene.';

/** Counts one call; false when the player is over the limit. Fails open if the counter itself errors. */
export async function withinRateLimit(admin: SupabaseClient, userId: string, action: string, limit: number, windowSeconds: number) {
  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_user_id: userId, p_action: action, p_limit: limit, p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error('Rate limit check failed', action, error.message);
    return true;
  }
  return data !== false;
}

export async function enforceRateLimit(admin: SupabaseClient, userId: string, action: string, limit: number, windowSeconds: number) {
  if (!await withinRateLimit(admin, userId, action, limit, windowSeconds)) throw new Error(RATE_LIMITED_MESSAGE);
}

/**
 * Only messages written for players (plain `new Error`) reach the client.
 * Database, Auth and runtime errors carry table, constraint or code details,
 * so they are logged and replaced with the caller's generic message.
 */
export function publicErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.constructor === Error) return error.message;
  console.error('Unhandled function error', error);
  return fallback;
}
