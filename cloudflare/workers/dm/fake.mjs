import http from 'node:http';
const users = { 'token-a': ['11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-00000000000a', true], 'token-b': ['22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-00000000000b', false] };
const convs = new Map(), calls = []; let n = 0, t = 1000;
http.createServer((req, res) => {
  let body = ''; req.on('data', d => body += d); req.on('end', () => {
    const tok = (req.headers.authorization ?? '').replace('Bearer ', ''), j = body ? JSON.parse(body) : {}, send = (x, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(x)); };
    if (req.url === '/auth/v1/user') { const u = users[tok]; return u ? send({ id: u[0] }) : send({}, 401); }
    if (req.url === '/ctl/state') return send({ calls, convs: [...convs] });
    const fn = req.url.split('/rpc/')[1]; calls.push({ fn, args: j });
    if (fn === 'random_identity_for') { const u = Object.values(users).find(x => x[0] === j.p_auth_user); return send([{ identity_id: u[1], eligible: true }]); }
    if (fn === 'dm_start') { const me = Object.values(users).find(x => x[1] === j.p_identity); if (!me[2]) return send({ message: 'plus_required' }, 400); const id = '00000000-0000-0000-0000-' + String(++n).padStart(12, '0'); convs.set(id, { a: j.p_identity, b: 'bbbbbbbb-0000-0000-0000-00000000000b', msgs: [] }); return send(id); }
    const c = convs.get(j.p_conv); const mine = c && (c.a === j.p_identity || c.b === j.p_identity);
    if (fn === 'dm_list') return send([...convs].filter(([, v]) => v.a === j.p_identity || v.b === j.p_identity).map(([id, v]) => ({ conversation_id: id, peer_name: 'Quiet Static', peer_mark: 1, last_enc: v.msgs.at(-1)?.enc ?? null, last_at: new Date(t).toISOString(), last_from_me: v.msgs.at(-1)?.from === j.p_identity, unread: v.msgs.filter(m => m.from !== j.p_identity && !m.read).length })));
    if (fn === 'dm_peer_name') return send(mine ? 'Quiet Static' : null);
    if (fn === 'dm_messages') return send(mine ? [...c.msgs].reverse().map((m, i) => ({ id: 'm' + i, mine: m.from === j.p_identity, content_enc: m.enc, created_at: new Date(m.t).toISOString() })) : []);
    if (fn === 'dm_send') { if (!mine) return send({ message: 'not_found' }, 400); const m = { from: j.p_identity, enc: j.p_enc, t: ++t }; c.msgs.push(m); return send([{ id: 'new' + t, created_at: new Date(t).toISOString() }]); }
    if (fn === 'dm_mark_read') { if (c) c.msgs.forEach(m => { if (m.from !== j.p_identity) m.read = true; }); return send(null); }
    if (fn === 'dm_block_peer') return mine ? send(null) : send({ message: 'not_found' }, 400);
    send(null);
  });
}).listen(54395, () => console.log('fake up'));
