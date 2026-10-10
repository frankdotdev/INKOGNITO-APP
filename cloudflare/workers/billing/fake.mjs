import http from 'node:http';
const users = { 'token-a': ['11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-00000000000a'], 'token-b': ['22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-00000000000b'] };
const admins = { 'token-fin': ['f1111111-1111-1111-1111-111111111111', 'finance', 'aal2'], 'token-support': ['f2222222-2222-2222-2222-222222222222', 'support', 'aal2'], 'token-aal1': ['f3333333-3333-3333-3333-333333333333', 'finance', 'aal1'] }; let refundMode = 'ok';
const orders = new Map(), tx = new Map(), subs = new Map(), rpcCalls = [], psCalls = []; let breakVerify = false, n = 0;
http.createServer((req, res) => {
  let body = ''; req.on('data', d => body += d); req.on('end', () => {
    const tok = (req.headers.authorization ?? '').replace('Bearer ', ''), j = body ? JSON.parse(body) : {}, send = (x, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(x)); };
    if (req.url === '/auth/v1/user') { const u = users[tok] ?? admins[tok]; return u ? send({ id: u[0] }) : send({}, 401); }
    if (req.url === '/ctl/refund-mode') { refundMode = j.mode; return send({}); }
    if (req.url === '/rest/v1/rpc/admin_whoami') { const a = admins[tok]; return send(a ? [{ role: a[1], aal: a[2] }] : []); }
    if (req.url === '/ctl/state') return send({ rpcCalls, psCalls, subs: [...subs] });
    if (req.url === '/ctl/pay') { tx.set(j.reference, { status: 'success', id: 4242, amount: j.amount, currency: j.currency, reference: j.reference, customer: { customer_code: j.customer } }); return send({}); }
    if (req.url === '/ctl/break') { breakVerify = j.on; return send({}); }
    if (req.url.startsWith('/paystack/')) {
      const p = req.url.slice(9); psCalls.push({ path: p, method: req.method, body: j, auth: req.headers.authorization });
      if (p === '/transaction/initialize') return send({ status: true, data: { authorization_url: 'https://checkout.paystack.test/' + j.reference, reference: j.reference } });
      if (p.startsWith('/transaction/verify/')) { if (breakVerify) return send({}, 500); const t = tx.get(decodeURIComponent(p.slice(20))); return t ? send({ status: true, data: t }) : send({ status: true, data: { status: 'abandoned', reference: p.slice(20), amount: 0, currency: 'USD', id: 0 } }); }
      if (p === '/refund') return refundMode === 'reject' ? send({ status: false, message: 'nope' }, 400) : send({ status: true, data: { status: refundMode === 'processed' ? 'processed' : 'pending', id: 777 } });
if (p.startsWith('/subscription/disable')) return send({ status: true });
      if (p.startsWith('/subscription/')) return send({ status: true, data: { email_token: 'tok_' + p.slice(14) } });
    }
    const fn = req.url.split('/rpc/')[1]; rpcCalls.push({ fn, args: j });
    if (fn === 'random_identity_for') { const u = Object.values(users).find(x => x[0] === j.p_auth_user); return send([{ identity_id: u[1], eligible: true }]); }
    if (fn === 'billing_start_checkout') {
      const a = j.p_alias?.toLowerCase(); if (a && !/^[a-z][a-z0-9_]{2,19}$/.test(a)) return send({ message: 'alias_invalid' }, 400); if (a === 'taken') return send({ message: 'alias_taken' }, 400); if (a === 'admin') return send({ message: 'alias_reserved' }, 400);
      const ref = 'ink_' + String(++n).padStart(32, '0'); orders.set(ref, { identity_id: j.p_identity, amount: j.p_amount, currency: j.p_currency, alias: a, paid: false }); return send(ref);
    }
    if (fn === 'billing_get_order') { const o = orders.get(j.p_reference); return send(o ? [{ identity_id: o.identity_id, status: o.paid ? 'paid' : 'pending', amount: o.amount, currency: o.currency, alias: o.alias }] : []); }
    if (fn === 'billing_complete_order') { const o = orders.get(j.p_reference); if (!o) return send('unknown'); if (o.paid) return send('already'); if (o.amount !== j.p_amount || o.currency !== j.p_currency) return send('mismatch'); o.paid = true; subs.set(o.identity_id, { customer: j.p_customer_code }); return send('ok'); }
    if (fn === 'billing_begin_refund') { const a = Object.values(admins).find(x => x[0] === j.p_admin); const o = orders.get(j.p_reference); if (!a || a[1] !== 'finance') return send({ message: 'forbidden' }, 400); if ((j.p_reason ?? '').length < 5) return send({ message: 'reason_required' }, 400); if (!o || !o.paid || o.refund) return send({ message: 'not_refundable' }, 400); o.refund = 'pending'; return send([{ reference: j.p_reference, amount: o.amount, currency: o.currency, identity_id: o.identity_id }]); }
    if (fn === 'billing_finish_refund') { const o = orders.get(j.p_reference); if (!o || o.refund !== 'pending') return send('ignored'); o.refund = j.p_ok ? 'refunded' : null; return send(j.p_ok ? 'refunded' : 'failed'); }
    if (fn === 'billing_record_renewal') return send(subs.size ? 'ok' : 'unknown');
    if (fn === 'billing_get_subscription_code') return send('SUB_1');
    return send(null);
  });
}).listen(54396, () => console.log('fake up'));
