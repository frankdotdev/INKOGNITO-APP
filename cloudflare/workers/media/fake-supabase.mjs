import http from 'node:http';
const calls = []; let scanDown = false, scans = 0; let deleteKeys = [];
const users = { 'token-a': ['11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-00000000000a'], 'token-rl': ['33333333-3333-3333-3333-333333333333', 'cccccccc-0000-0000-0000-00000000000c'] };
http.createServer((req, res) => {
  let body = ''; req.on('data', d => body += d); req.on('end', () => {
    const tok = (req.headers.authorization ?? '').replace('Bearer ', '');
    if (req.url === '/auth/v1/user') { const u = users[tok]; if (!u) { res.writeHead(401).end('{}'); return; } res.end(JSON.stringify({ id: u[0] })); return; }
    if (req.url === '/calls') { res.end(JSON.stringify(calls)); return; }
    if (req.url === '/queue-delete') { deleteKeys = JSON.parse(body); res.end('ok'); return; }
    if (req.url === '/scan/v1/moderations') { scans++; if (scanDown) { res.writeHead(500).end('{}'); return; }
      const img = Buffer.from(JSON.parse(body).input[0].image_url.url.split(',')[1], 'base64').toString('latin1');
      const scores = { 'sexual/minors': img.includes('TESTBLOCK') ? 0.9 : 0.001, violence: img.includes('TESTREVIEW') ? 0.9 : 0.01, sexual: 0.01 };
      res.end(JSON.stringify({ results: [{ flagged: img.includes('TESTBLOCK') || img.includes('TESTREVIEW'), categories: { 'sexual/minors': img.includes('TESTBLOCK') }, category_scores: scores }] })); return; }
    if (req.url === '/scan-down') { scanDown = JSON.parse(body || '{}').on; res.end('{}'); return; }
    if (req.url === '/scan-count') { res.end(JSON.stringify(scans)); return; }
    const fn = req.url.split('/rpc/')[1]; const args = body ? JSON.parse(body) : {}; calls.push({ fn, args });
    if (fn === 'random_identity_for') { const u = Object.values(users).find(x => x[0] === args.p_auth_user); res.end(JSON.stringify([{ identity_id: u[1], eligible: true }])); return; }
    if (fn === 'media_register') { if (args.p_identity.startsWith('cccccccc')) { res.writeHead(400).end(JSON.stringify({ message: 'rate_limited' })); return; } res.end(JSON.stringify('dddddddd-0000-0000-0000-000000000001')); return; }
    if (fn === 'media_take_deletions') { res.end(JSON.stringify(deleteKeys.map((k, i) => ({ id: 'eeeeeeee-0000-0000-0000-00000000000' + i, r2_key: k })))); deleteKeys = []; return; }
    res.end('null');
  });
}).listen(54398, () => console.log('fake up'));
