import { createClient } from 'npm:@supabase/supabase-js@2';
import { enforceRateLimit, publicErrorMessage } from '../_shared/guard.ts';
import { cosmetic, productGrants, REWARDED_AD_COINS, REWARDED_AD_DAILY_LIMIT } from '../../../src/store/catalog.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Command =
  | { type: 'sync-purchases' }
  | { type: 'claim-rewarded' }
  | { type: 'buy-item'; itemId: string };

type RevenueCatTransaction = { id?: string; store_transaction_id?: string; store?: string; is_sandbox?: boolean; purchase_date?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * The app logs in to RevenueCat with the Supabase user ID, so the subscriber
 * record lists exactly the store transactions RevenueCat validated for this
 * player. Nothing the client sends is trusted about a purchase.
 */
async function verifiedTransactions(userId: string) {
  const secret = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!secret) throw new Error('Mağaza şu anda kullanılamıyor.');
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    console.error('RevenueCat subscriber lookup failed', response.status);
    throw new Error('Satın almalar doğrulanamadı. Biraz sonra tekrar dene.');
  }
  const body = await response.json() as { subscriber?: { non_subscriptions?: Record<string, RevenueCatTransaction[]> } };
  const allowSandbox = Deno.env.get('STORE_ALLOW_SANDBOX') !== 'false';
  const result: { productId: string; transaction: RevenueCatTransaction }[] = [];
  for (const [productId, transactions] of Object.entries(body.subscriber?.non_subscriptions ?? {})) {
    for (const transaction of transactions ?? []) {
      if (transaction.is_sandbox && !allowSandbox) continue;
      result.push({ productId, transaction });
    }
  }
  return result;
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
    if (authError || !user) return json({ error: 'Oturum süresi doldu.' }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const command = await request.json() as Command;
    if (!command || typeof command.type !== 'string') throw new Error('Geçersiz istek.');

    if (command.type === 'sync-purchases') {
      await enforceRateLimit(admin, user.id, 'store-sync', 30, 600);
      let coins = 0;
      const items: string[] = [];
      for (const { productId, transaction } of await verifiedTransactions(user.id)) {
        const grants = productGrants(productId);
        const transactionId = transaction.store_transaction_id || transaction.id;
        if (!grants || !transactionId) continue;
        const result = await admin.rpc('credit_store_purchase', {
          p_user_id: user.id, p_transaction_id: transactionId, p_product_id: productId,
          p_store: transaction.store ?? 'unknown', p_is_sandbox: !!transaction.is_sandbox,
          p_purchased_at: transaction.purchase_date ?? null, p_coins: grants.coins, p_items: grants.items,
        });
        if (result.error) throw result.error;
        if (result.data === true) { coins += grants.coins; items.push(...grants.items); }
      }
      return json({ credited: { coins, items } });
    }

    if (command.type === 'claim-rewarded') {
      await enforceRateLimit(admin, user.id, 'store-rewarded', 10, 600);
      const result = await admin.rpc('claim_rewarded_coins', {
        p_user_id: user.id, p_coins: REWARDED_AD_COINS, p_daily_limit: REWARDED_AD_DAILY_LIMIT,
      });
      if (result.error) throw result.error;
      if (result.data === null) throw new Error('Bugünkü ödüllü video hakların bitti. Yarın tekrar gel.');
      return json({ coins: Number(result.data), reward: REWARDED_AD_COINS });
    }

    if (command.type === 'buy-item') {
      await enforceRateLimit(admin, user.id, 'store-buy-item', 20, 600);
      const item = cosmetic(command.itemId);
      if (!item || item.price === 0) throw new Error('Bu ürün bulunamadı.');
      if (item.price === 'premium') throw new Error('Bu ürün yalnızca Premium Koleksiyon ile açılır.');
      if (typeof item.price !== 'number') throw new Error('Bu çuha satılmaz; büyük masada kazanılır.');
      const result = await admin.rpc('buy_cosmetic', { p_user_id: user.id, p_item_id: item.id, p_price: item.price });
      if (result.error) {
        if (result.error.message.includes('insufficient coins')) throw new Error('Bu ürün için yeterli coinin yok.');
        if (result.error.message.includes('already owned')) throw new Error('Bu ürün zaten sende.');
        throw result.error;
      }
      return json({ coins: Number(result.data) });
    }

    throw new Error('Geçersiz istek.');
  } catch (error) {
    return json({ error: publicErrorMessage(error, 'Mağaza işlemi tamamlanamadı.') }, 400);
  }
});
