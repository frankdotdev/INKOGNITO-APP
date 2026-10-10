import { supabase, ensureSession } from './supabase';
import { rpc } from './postService';
const BILL = process.env.NEXT_PUBLIC_BILLING_URL?.replace(/\/$/, '');
export const billingEnabled = !!BILL;
export type Currency = 'USD' | 'NGN';
export type Plans = Record<Currency, { amount: number; label: string }>;
export type Entitlements = { plus: boolean; plus_until: string | null; auto_renews: boolean; alias: string | null; alias_revoked: boolean; speak_as_alias: boolean; can_claim_alias: boolean; ai_daily_limit: number };
export class BillingError extends Error { constructor(public code: string) { super(code); } }
async function call<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  if (!BILL) throw new BillingError('disabled');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) { await ensureSession(); const { data } = await supabase.auth.getSession(); if (!data.session) throw new BillingError('unauthorized'); headers.Authorization = `Bearer ${data.session.access_token}`; }
  const res = await fetch(`${BILL}${path}`, { ...init, headers });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new BillingError(j.error ?? 'unavailable');
  return j as T;
}
export const billingService = {
  plans: () => call<Plans>('/billing/plans', {}, false),
  entitlements: () => rpc<Entitlements>('my_entitlements'),
  checkAlias: async (alias: string) => { const [r] = await rpc<{ available: boolean; reason: string }[]>('check_alias', { p_alias: alias }); return r; },
  checkout: (currency: Currency, alias: string | null) => call<{ url: string; reference: string }>('/billing/checkout', { method: 'POST', body: JSON.stringify({ currency, alias }) }),
  verify: (reference: string) => call<{ status: 'paid' | 'pending' | 'failed' | 'review' }>(`/billing/verify?reference=${encodeURIComponent(reference)}`),
  cancel: () => call<{ ok: true }>('/billing/cancel', { method: 'POST' }),
  setSpeakAsAlias: (on: boolean) => rpc<void>('set_alias_default', { p_on: on }),
};
export const aliasReason = (r: string) => r === 'invalid' ? 'Use 3 to 20 letters, numbers or single underscores, starting with a letter.' : r === 'reserved' ? 'That name is reserved.' : r === 'taken' ? 'That name is taken.' : r === 'pending' ? 'Someone is claiming that name right now. Try another, or check back in a few minutes.' : '';
export const billingErrorText = (e: unknown) => {
  const c = e instanceof BillingError ? e.code : '';
  return ({ alias_invalid: aliasReason('invalid'), alias_reserved: aliasReason('reserved'), alias_taken: aliasReason('taken'), has_alias: 'You already have a name.', rate_limited: 'Too many attempts. Try again later.', payment_provider_unavailable: "The payment service isn't responding. You haven't been charged. Try again soon.", disabled: 'Payments are not switched on yet.' } as Record<string, string>)[c] ?? "Something went wrong. You haven't been charged. Try again.";
};
