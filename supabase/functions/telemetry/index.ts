import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Yalnızca POST desteklenir.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
    const authorization = request.headers.get('Authorization');
    if (!url || !publicKey || !authorization) return json({ error: 'Oturum doğrulanamadı.' }, 401);
    const authClient = createClient(url, publicKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: { user }, error } = await authClient.auth.getUser();
    if (error || !user) return json({ error: 'Oturum süresi doldu.' }, 401);
    const payload = await request.json() as Record<string, unknown>;
    console.error('[amerikano-client-error]', JSON.stringify({
      userId: user.id,
      context: text(payload.context, 80),
      message: text(payload.message, 500),
      stack: text(payload.stack, 4_000),
      fatal: payload.fatal === true,
      platform: text(payload.platform, 20),
      appVersion: text(payload.appVersion, 30),
      receivedAt: new Date().toISOString(),
    }));
    return json({ accepted: true });
  } catch {
    return json({ error: 'Hata kaydı alınamadı.' }, 400);
  }
});
