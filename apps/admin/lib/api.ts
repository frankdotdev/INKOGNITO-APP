import { supabase } from './supabase';
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export type Role = 'super_admin' | 'moderator' | 'safety_moderator' | 'support' | 'analytics' | 'finance';
export const canFinance = (r: Role) => r === 'super_admin' || r === 'finance';
export const canModerate = (r: Role) => r === 'super_admin' || r === 'moderator' || r === 'safety_moderator';
export type Metrics = Record<string, number | string>;
export type ReportRow = { id: string; target_type: 'post' | 'comment' | 'whisper'; target_id: string; category: string; description: string | null; priority: number; status: string; created_at: string; report_count: number; target_body: string | null; target_state: string | null; author_name: string | null };
export type RandomReportRow = { id: string; session_id: string | null; reported_identity: string; category: string; priority: number; status: string; transcript: { s: string; t: string; at: number | string }[]; created_at: string; source: 'random' | 'dm' };
export type PostRow = { id: string; body: string; status: string; moderation_state: string; comments_enabled: boolean; created_at: string; author_name: string; report_count: number };
export type OrderRow = { reference: string; identity_id: string; alias: string | null; currency: string; amount: number; status: string; provider_ref: string | null; created_at: string; paid_at: string | null };
export type ReviewItem = { id: string; body: string; author_name: string; created_at: string; media: { key: string; width: number; height: number }[] };
export type ScanEvent = { id: string; identity_id: string; result: 'block' | 'review'; urgent: boolean; categories: Record<string, number | boolean>; created_at: string };
export type AuditRow = { id: number; admin_email: string | null; admin_role: string; action: string; target_type: string | null; target_id: string | null; reason: string | null; metadata: Record<string, unknown>; created_at: string };
export type IdentityRecord = { id: string; status: string; risk_level: string; trust_level: number; created_at: string; last_seen_at: string; devices: number; posts: number; comments: number; reports_filed: number; reports_against: number; random_reports_against: number; recent_actions: { action: string; reason: string | null; role: string; at: string }[] };
export const api = {
  whoami: () => rpc<{ role: Role; aal: string }[]>('admin_whoami'),
  metrics: () => rpc<Metrics>('admin_metrics'),
  reports: (status: string) => rpc<ReportRow[]>('admin_list_reports', { p_status: status }),
  randomReports: (status: string) => rpc<RandomReportRow[]>('admin_list_random_reports', { p_status: status }),
  resolve: (kind: 'content' | 'random', id: string, resolution: 'dismissed' | 'actioned', note?: string) => rpc<void>('admin_resolve_report', { p_kind: kind, p_id: id, p_resolution: resolution, p_note: note ?? null }),
  posts: (query: string, status: string) => rpc<PostRow[]>('admin_list_posts', { p_query: query || null, p_status: status || null }),
  setPost: (id: string, action: 'remove' | 'restore' | 'approve' | 'reject' | 'lock_comments' | 'unlock_comments', reason: string) => rpc<void>('admin_set_post_state', { p_post: id, p_action: action, p_reason: reason }),
  setComment: (id: string, action: 'remove' | 'restore', reason: string) => rpc<void>('admin_set_comment_state', { p_comment: id, p_action: action, p_reason: reason }),
  targetIdentity: (type: string, id: string) => rpc<string>('admin_target_identity', { p_type: type, p_id: id }),
  identity: (id: string) => rpc<IdentityRecord>('admin_identity_record', { p_identity: id }),
  setIdentity: (id: string, action: 'restrict' | 'suspend' | 'ban' | 'restore', reason: string) => rpc<void>('admin_set_identity_state', { p_identity: id, p_action: action, p_reason: reason }),
  orders: (status: string) => rpc<OrderRow[]>('admin_list_orders', { p_status: status }),
  resolveOrder: (reference: string, note: string) => rpc<void>('admin_resolve_order', { p_reference: reference, p_note: note }),
  reviewQueue: () => rpc<ReviewItem[]>('admin_review_queue'),
  reviewCount: () => rpc<number>('admin_review_count'),
  scanEvents: () => rpc<ScanEvent[]>('admin_scan_events', { p_limit: 100 }),
  async refund(reference: string, reason: string): Promise<'refunded' | 'pending'> {
    const base = process.env.NEXT_PUBLIC_BILLING_URL?.replace(/\/$/, ''); if (!base) throw new Error('refunds_not_configured');
    const { data } = await supabase.auth.getSession(); if (!data.session) throw new Error('forbidden');
    const r = await fetch(`${base}/billing/admin/refund`, { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ reference, reason }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? 'failed'); return j.status;
  },
  audit: () => rpc<AuditRow[]>('admin_audit', { p_limit: 200 }),
};
export const friendly = (e: unknown) => { const m = e instanceof Error ? e.message : ''; return m.includes('mfa_required') ? 'Your session needs MFA. Sign in again.' : m.includes('forbidden') ? "Your role isn't allowed to do that." : m.includes('reason_required') ? 'A reason of at least 5 characters is required.' : m.includes('not_found') || m.includes('not_refundable') ? 'That item no longer exists, was already handled, or is outside the refund window (30 days).' : m.includes('refunds_not_configured') ? 'Refunds are not configured: set NEXT_PUBLIC_BILLING_URL.' : m.includes('payment_provider_rejected') ? 'Paystack rejected the refund. Nothing was changed.' : 'Something went wrong. Try again.'; };
