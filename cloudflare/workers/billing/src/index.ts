export interface Env {
  SUPABASE_URL: string; SUPABASE_ANON_KEY: string; SUPABASE_SERVICE_KEY: string; PAYSTACK_SECRET_KEY: string; ALLOWED_ORIGINS: string; SITE_URL: string;
  PAYMENT_EMAIL_DOMAIN: string; PRICE_USD_CENTS: string; PRICE_NGN_KOBO: string; PLAN_CODE_USD: string; PLAN_CODE_NGN: string; PAYSTACK_BASE_URL?: string;
}
const UUID = /^[0-9a-f-]{36}$/, REF = /^ink_[0-9a-f]{32}$/;
const cors = (req: Request, env: Env): Record<string, string> => {
  const o = req.headers.get('Origin');
  return o && env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).includes(o)
    ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' } : { Vary: 'Origin' };
};
const json = (o: unknown, status: number, h: Record<string, string> = {}) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...h } });

type Rpc<T> = { ok: boolean; status: number; data: T | null; text: string };
async function rpc<T>(env: Env, fn: string, args: Record<string, unknown> = {}): Promise<Rpc<T>> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const text = await r.text(); let data: T | null = null; try { data = text ? (JSON.parse(text) as T) : null; } catch {}
  return { ok: r.ok, status: r.status, data, text };
}
const must = async <T>(p: Promise<Rpc<T>>): Promise<T | null> => { const r = await p; if (!r.ok) throw new Error('rpc failed'); return r.data; };

async function identityFor(env: Env, req: Request): Promise<string | 'unauthorized' | 'forbidden' | 'unavailable'> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, ''); if (!jwt) return 'unauthorized';
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` } });
  if (!r.ok) return r.status >= 500 ? 'unavailable' : 'unauthorized';
  const u = (await r.json()) as { id?: string }; if (!u.id || !UUID.test(u.id)) return 'unauthorized';
  const rows = (await rpc<{ identity_id: string; eligible: boolean }[]>(env, 'random_identity_for', { p_auth_user: u.id })).data;
  if (!rows) return 'unavailable'; return rows[0]?.eligible ? rows[0].identity_id : 'forbidden';
}

const ps = (env: Env, path: string, init: RequestInit = {}) => fetch(`${env.PAYSTACK_BASE_URL ?? 'https://api.paystack.co'}${path}`, { ...init, headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' } });
type Verified = { status: string; id: number; amount: number; currency: string; reference: string; customer?: { customer_code?: string } };
async function verifyTx(env: Env, reference: string): Promise<Verified | null> {
  const r = await ps(env, `/transaction/verify/${encodeURIComponent(reference)}`); if (!r.ok) throw new Error('paystack verify failed');
  const j = (await r.json()) as { status?: boolean; data?: Verified }; return j.status && j.data ? j.data : null;
}
/** Asks Paystack to stop renewing this identity's subscription. Returns false if there is nothing to cancel or Paystack refused. */
async function stopRenewals(env: Env, identity: string): Promise<boolean> {
  const code = await must<string>(rpc(env, 'billing_get_subscription_code', { p_identity: identity })); if (!code) return false;
  const sub = await ps(env, `/subscription/${encodeURIComponent(code)}`); const sj = (await sub.json().catch(() => ({}))) as { data?: { email_token?: string } };
  if (!sub.ok || !sj.data?.email_token) return false;
  const off = await ps(env, '/subscription/disable', { method: 'POST', body: JSON.stringify({ code, token: sj.data.email_token }) }); if (!off.ok) return false;
  await must(rpc(env, 'billing_subscription_ended', { p_subscription_code: code, p_status: 'cancelled' })); return true;
}
/** Admin sign-in check for refunds: a real Supabase session, an enabled finance or super admin, and MFA completed. */
async function adminFor(env: Env, req: Request): Promise<{ id: string } | 'unauthorized' | 'forbidden'> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, ''); if (!jwt) return 'unauthorized';
  const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` } }); if (!u.ok) return 'unauthorized';
  const id = ((await u.json()) as { id?: string }).id; if (!id || !UUID.test(id)) return 'unauthorized';
  const w = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/admin_whoami`, { method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: '{}' });
  const row = w.ok ? ((await w.json()) as { role?: string; aal?: string }[])[0] : undefined;
  return row && row.aal === 'aal2' && (row.role === 'super_admin' || row.role === 'finance') ? { id } : 'forbidden';
}
const prices = (env: Env) => ({
  USD: { amount: Number(env.PRICE_USD_CENTS), label: `$${(Number(env.PRICE_USD_CENTS) / 100).toFixed(2)}`, plan: env.PLAN_CODE_USD },
  NGN: { amount: Number(env.PRICE_NGN_KOBO), label: `₦${(Number(env.PRICE_NGN_KOBO) / 100).toLocaleString('en-US')}`, plan: env.PLAN_CODE_NGN },
});
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
async function validSignature(env: Env, raw: string, sig: string | null): Promise<boolean> {
  if (!sig) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.PAYSTACK_SECRET_KEY), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const want = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  if (want.length !== sig.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ sig.charCodeAt(i); return d === 0; // constant time
}

/** Verifies the payment with Paystack itself (never trusts the caller or the webhook body) and grants what was bought. */
async function settleOrder(env: Env, reference: string): Promise<'paid' | 'pending' | 'failed' | 'review' | 'not_order'> {
  const order = (await must(rpc<{ identity_id: string }[]>(env, 'billing_get_order', { p_reference: reference })))?.[0];
  if (!order) return 'not_order';
  const v = await verifyTx(env, reference);
  if (!v) return 'pending';
  if (v.status !== 'success') return v.status === 'failed' || v.status === 'reversed' ? 'failed' : 'pending'; // Paystack reports an unpaid transaction as 'abandoned', so that still counts as pending
  const res = await must<string>(rpc(env, 'billing_complete_order', { p_reference: reference, p_provider_ref: String(v.id), p_amount: v.amount, p_currency: v.currency, p_customer_code: v.customer?.customer_code ?? null, p_subscription_code: null }));
  return res === 'ok' || res === 'already' ? 'paid' : 'review'; // 'mismatch' / 'alias_taken' need a person to look at it
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url); const h = cors(req, env);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname === '/billing/plans' && req.method === 'GET') { const p = prices(env); return json({ USD: { amount: p.USD.amount, label: p.USD.label }, NGN: { amount: p.NGN.amount, label: p.NGN.label } }, 200, h); }

    if (url.pathname === '/billing/webhook' && req.method === 'POST') {
      const raw = await req.text();
      if (!(await validSignature(env, raw, req.headers.get('x-paystack-signature')))) return new Response('Invalid signature', { status: 401 });
      let ev: { event?: string; data?: any }; try { ev = JSON.parse(raw); } catch { return new Response('bad', { status: 400 }); }
      const d = ev.data ?? {};
      try {
        if (ev.event === 'charge.success' && typeof d.reference === 'string') {
          const s = await settleOrder(env, d.reference);
          if (s === 'not_order') { // a renewal charge made by the subscription
            const v = await verifyTx(env, d.reference);
            if (v?.status === 'success') await must(rpc(env, 'billing_record_renewal', { p_customer_code: v.customer?.customer_code ?? null, p_subscription_code: d.plan?.subscription_code ?? null, p_key: `charge.success:${d.reference}` }));
          }
        } else if (ev.event === 'subscription.create' && d.subscription_code && d.customer?.customer_code) {
          await must(rpc(env, 'billing_set_subscription', { p_customer_code: d.customer.customer_code, p_subscription_code: d.subscription_code }));
        } else if ((ev.event === 'subscription.disable' || ev.event === 'subscription.not_renew') && (d.subscription_code ?? d.subscription?.subscription_code)) {
          await must(rpc(env, 'billing_subscription_ended', { p_subscription_code: d.subscription_code ?? d.subscription.subscription_code, p_status: 'cancelled' }));
        } else if ((ev.event === 'refund.processed' || ev.event === 'refund.failed') && (d.transaction_reference ?? d.transaction?.reference)) {
          await must(rpc(env, 'billing_finish_refund', { p_reference: d.transaction_reference ?? d.transaction.reference, p_ok: ev.event === 'refund.processed', p_refund_ref: String(d.refund_reference ?? d.id ?? '') }));
        } else if (ev.event === 'invoice.payment_failed' && d.subscription?.subscription_code) {
          await must(rpc(env, 'billing_subscription_ended', { p_subscription_code: d.subscription.subscription_code, p_status: 'past_due' }));
        }
      } catch { return new Response('retry', { status: 500 }); } // Paystack retries non-200 responses
      return new Response('ok');
    }

    if (!url.pathname.startsWith('/billing/')) return new Response('Not found', { status: 404 });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const origin = req.headers.get('Origin'); if (origin && !h['Access-Control-Allow-Origin']) return json({ error: 'forbidden' }, 403, h);
    if (url.pathname === '/billing/admin/refund' && req.method === 'POST') {
      const adm = await adminFor(env, req).catch(() => 'unauthorized' as const);
      if (adm === 'unauthorized') return json({ error: 'unauthorized' }, 401, h); if (adm === 'forbidden') return json({ error: 'forbidden' }, 403, h);
      const b = (await req.json().catch(() => ({}))) as { reference?: unknown; reason?: unknown };
      if (typeof b.reference !== 'string' || !REF.test(b.reference) || typeof b.reason !== 'string') return json({ error: 'bad_request' }, 400, h);
      const begin = await rpc<{ identity_id: string }[]>(env, 'billing_begin_refund', { p_reference: b.reference, p_admin: adm.id, p_reason: b.reason });
      if (!begin.ok) { const t = begin.text; return json({ error: t.includes('not_refundable') ? 'not_refundable' : t.includes('reason_required') ? 'reason_required' : t.includes('forbidden') ? 'forbidden' : 'failed' }, t.includes('not_refundable') ? 409 : t.includes('reason_required') ? 400 : t.includes('forbidden') ? 403 : 502, h); }
      let accepted = false, processed = false, refundRef = '';
      try { const r = await ps(env, '/refund', { method: 'POST', body: JSON.stringify({ transaction: b.reference, merchant_note: b.reason.slice(0, 200) }) }); const j = (await r.json().catch(() => ({}))) as { status?: boolean; data?: { status?: string; id?: number | string } };
        accepted = r.ok && j.status === true; processed = j.data?.status === 'processed'; refundRef = String(j.data?.id ?? ''); } catch {}
      if (!accepted) { await rpc(env, 'billing_finish_refund', { p_reference: b.reference, p_ok: false, p_refund_ref: 'rejected by Paystack' }); return json({ error: 'payment_provider_rejected' }, 502, h); }
      await stopRenewals(env, begin.data![0].identity_id).catch(() => false); // best effort: the refund is already under way
      if (processed) await rpc(env, 'billing_finish_refund', { p_reference: b.reference, p_ok: true, p_refund_ref: refundRef });
      return json({ status: processed ? 'refunded' : 'pending' }, 200, h); // 'pending' completes when Paystack's refund.processed webhook arrives
    }
    const who = await identityFor(env, req).catch(() => 'unavailable' as const);
    if (who === 'unauthorized') return json({ error: 'unauthorized' }, 401, h);
    if (who === 'forbidden') return json({ error: 'not_allowed' }, 403, h);
    if (who === 'unavailable') return json({ error: 'unavailable' }, 503, h);

    try {
      if (url.pathname === '/billing/checkout' && req.method === 'POST') {
        let b: { currency?: unknown; alias?: unknown }; try { b = await req.json(); } catch { return json({ error: 'bad_request' }, 400, h); }
        const cur = b.currency === 'NGN' ? 'NGN' : b.currency === 'USD' ? 'USD' : null; const price = cur && prices(env)[cur];
        const alias = typeof b.alias === 'string' && b.alias.trim() ? b.alias.trim().slice(0, 40) : null;
        if (!cur || !price || !price.plan || !(price.amount > 0)) return json({ error: 'bad_request' }, 400, h);
        const r = await rpc<string>(env, 'billing_start_checkout', { p_identity: who, p_alias: alias, p_currency: cur, p_amount: price.amount });
        if (!r.ok) {
          const t = r.text; const code = t.includes('alias_taken') || t.includes('alias_pending') ? 'alias_taken' : t.includes('alias_reserved') ? 'alias_reserved' : t.includes('alias_invalid') ? 'alias_invalid' : t.includes('has_alias') ? 'has_alias' : t.includes('rate_limited') ? 'rate_limited' : 'failed';
          return json({ error: code }, code === 'alias_taken' || code === 'has_alias' ? 409 : code === 'rate_limited' ? 429 : code === 'failed' ? 502 : 400, h);
        }
        const reference = r.data as string;
        const init = await ps(env, '/transaction/initialize', { method: 'POST', body: JSON.stringify({ email: `${reference}@${env.PAYMENT_EMAIL_DOMAIN}`, amount: price.amount, currency: cur, reference, plan: price.plan, callback_url: `${env.SITE_URL}/settings/plus/return`, metadata: { order: reference } }) });
        const j = (await init.json().catch(() => ({}))) as { status?: boolean; data?: { authorization_url?: string } };
        if (!init.ok || !j.status || !j.data?.authorization_url) return json({ error: 'payment_provider_unavailable' }, 502, h);
        return json({ url: j.data.authorization_url, reference }, 200, h);
      }

      if (url.pathname === '/billing/verify' && req.method === 'GET') {
        const reference = url.searchParams.get('reference') ?? '';
        if (!REF.test(reference)) return json({ error: 'bad_request' }, 400, h);
        const order = (await must(rpc<{ identity_id: string; status: string }[]>(env, 'billing_get_order', { p_reference: reference })))?.[0];
        if (!order || order.identity_id !== who) return json({ error: 'not_found' }, 404, h);
        return json({ status: await settleOrder(env, reference) }, 200, h);
      }

      if (url.pathname === '/billing/cancel' && req.method === 'POST') {
        const had = await must<string>(rpc(env, 'billing_get_subscription_code', { p_identity: who })); if (!had) return json({ error: 'no_subscription' }, 404, h);
        return (await stopRenewals(env, who)) ? json({ ok: true }, 200, h) : json({ error: 'payment_provider_unavailable' }, 502, h);
      }
    } catch { return json({ error: 'unavailable' }, 503, h); }
    return json({ error: 'not_found' }, 404, h);
  },
};
