import { createClient } from 'npm:@supabase/supabase-js@2';
import { decodeJwt, importPKCS8, SignJWT } from 'npm:jose@5.9.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function appleClientSecret() {
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const clientId = Deno.env.get('APPLE_CLIENT_ID') ?? 'com.hegionsoft.amerikano';
  const privateKey = Deno.env.get('APPLE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
  if (!teamId || !keyId || !privateKey) {
    throw new Error('Apple hesap silme anahtarları sunucuda henüz yapılandırılmadı.');
  }

  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(privateKey, 'ES256');
  const secret = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(key);
  return { clientId, secret };
}

async function revokeAppleGrant(authorizationCode: string, expectedSubject?: string) {
  const { clientId, secret } = await appleClientSecret();
  const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      code: authorizationCode,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenResponse.json() as {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    error?: string;
  };
  if (!tokenResponse.ok || tokens.error) throw new Error('Apple yetkisi doğrulanamadı; tekrar dene.');

  if (expectedSubject && tokens.id_token && decodeJwt(tokens.id_token).sub !== expectedSubject) {
    throw new Error('Apple hesabı mevcut oyuncu hesabıyla eşleşmiyor.');
  }
  const token = tokens.refresh_token ?? tokens.access_token;
  if (!token) throw new Error('Apple iptal anahtarı alınamadı.');

  const revokeResponse = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      token,
      token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token',
    }),
  });
  if (!revokeResponse.ok) throw new Error('Apple giriş yetkisi kaldırılamadı; tekrar dene.');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Yalnızca POST desteklenir.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization');
    if (!url || !publicKey || !serviceKey || !authorization) throw new Error('Oturum doğrulanamadı.');

    const authClient = createClient(url, publicKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user || user.is_anonymous) return json({ error: 'Kalıcı bir kullanıcı hesabı bulunamadı.' }, 401);

    const body = await request.json().catch(() => ({})) as { appleAuthorizationCode?: unknown };
    const appleIdentity = user.identities?.find((identity) => identity.provider === 'apple');
    if (appleIdentity) {
      if (typeof body.appleAuthorizationCode !== 'string' || !body.appleAuthorizationCode) {
        throw new Error('Hesabı silmeden önce Apple ile tekrar doğrulama gerekli.');
      }
      const expectedSubject = typeof appleIdentity.identity_data?.sub === 'string'
        ? appleIdentity.identity_data.sub
        : undefined;
      await revokeAppleGrant(body.appleAuthorizationCode, expectedSubject);
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
    return json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Hesap silinemedi.';
    return json({ error: message }, 400);
  }
});

