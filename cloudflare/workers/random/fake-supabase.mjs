import http from 'node:http';
const calls = [];
const ids = { 'token-c': ['33333333-3333-3333-3333-333333333333', 'cccccccc-0000-0000-0000-00000000000c'], 'token-a': ['11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-00000000000a'], 'token-b': ['22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-00000000000b'] };
http.createServer((req, res) => {
  let body = ''; req.on('data', d => body += d); req.on('end', () => {
    const tok = (req.headers.authorization ?? '').replace('Bearer ', '');
    if (req.url === '/auth/v1/user') { const u = ids[tok]; if (!u) { res.writeHead(401).end('{}'); return; } res.end(JSON.stringify({ id: u[0] })); return; }
    if (req.url === '/calls') { res.end(JSON.stringify(calls)); return; }
    const fn = req.url.split('/rpc/')[1]; const args = body ? JSON.parse(body) : {}; calls.push({ fn, args });
    if (fn === 'random_mode_check') { const u = Object.values(ids).find(x => x[0] === args.p_auth_user); if (!u) { res.end('[]'); return; }
      const reason = args.p_mode === 'audio' ? 'disabled' : args.p_mode === 'video' && u[1].startsWith('cccccccc') ? 'adult_required' : 'ok'; res.end(JSON.stringify([{ identity_id: u[1], allowed: reason === 'ok', reason }])); return; }
    if (fn === 'random_identity_for') { const u = Object.values(ids).find(x => x[0] === args.p_auth_user); res.end(JSON.stringify([{ identity_id: u[1], eligible: true }])); return; }
    if (fn === 'random_blocked') { res.end('false'); return; }
    res.end('null');
  });
}).listen(54399, () => console.log('fake supabase up'));
