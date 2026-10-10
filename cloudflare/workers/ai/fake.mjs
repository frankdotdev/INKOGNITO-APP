import http from 'node:http';
const LIMIT = 3, users = { 'token-a': ['11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-00000000000a'], 'token-b': ['22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-00000000000b'] };
const sessions = new Map(), usage = new Map(), calls = [], providerRequests = []; let n = 0;
const lastUser = msgs => [...msgs].reverse().find(m => m.role === 'user')?.content ?? '';
http.createServer((req, res) => {
  let body = ''; req.on('data', d => body += d); req.on('end', () => {
    const tok = (req.headers.authorization ?? '').replace('Bearer ', ''), j = body ? JSON.parse(body) : {};
    if (req.url === '/auth/v1/user') { const u = users[tok]; if (!u) { res.writeHead(401).end('{}'); return; } res.end(JSON.stringify({ id: u[0] })); return; }
    if (req.url === '/state') { res.end(JSON.stringify({ calls, providerRequests })); return; }
    if (req.url === '/openai/v1/chat/completions') {
      providerRequests.push({ provider: 'groq', ...j }); const t = lastUser(j.messages);
      if (t.includes('FAILGROQ') || t.includes('FAILBOTH')) { res.writeHead(500).end('{}'); return; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const c of ['Hello there, ', "I'm here."]) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 11, completion_tokens: 7 } })}\n\ndata: [DONE]\n\n`); res.end(); return;
    }
    if (req.url.startsWith('/v1beta/models/')) {
      providerRequests.push({ provider: 'gemini', ...j }); const t = j.contents.at(-1).parts[0].text;
      if (t.includes('FAILBOTH')) { res.writeHead(500).end('{}'); return; }
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Gemini here for you.' }] } }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 5 } })); return;
    }
    const fn = req.url.split('/rpc/')[1]; calls.push({ fn, args: j }); const send = x => res.end(JSON.stringify(x));
    if (fn === 'random_identity_for') { const u = Object.values(users).find(x => x[0] === j.p_auth_user); return send([{ identity_id: u[1], eligible: true }]); }
    if (fn === 'ai_config') return send({ enabled: true, daily_limit: LIMIT, max_chars: 2000, context_messages: 16, burst_per_minute: 100 });
    if (fn === 'ai_begin_turn') {
      let sid = j.p_session; if (sid && (!sessions.has(sid) || sessions.get(sid).identity !== j.p_identity)) return send([{ allowed: false, reason: 'not_found', session_id: sid, remaining: 0, daily_limit: LIMIT }]);
      const used = usage.get(j.p_identity) ?? 0; if (used >= LIMIT) return send([{ allowed: false, reason: 'quota_exceeded', session_id: sid, remaining: 0, daily_limit: LIMIT }]);
      usage.set(j.p_identity, used + 1); if (!sid) { sid = `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`; sessions.set(sid, { identity: j.p_identity, msgs: [], title: null }); }
      return send([{ allowed: true, reason: 'ok', session_id: sid, remaining: LIMIT - used - 1, daily_limit: LIMIT }]);
    }
    if (fn === 'ai_refund_turn') { usage.set(j.p_identity, Math.max((usage.get(j.p_identity) ?? 1) - 1, 0)); return send(null); }
    if (fn === 'ai_record_exchange') { const s = sessions.get(j.p_session); s.msgs.push({ role: 'user', c: j.p_user_enc }, { role: 'assistant', c: j.p_assistant_enc }); s.title ??= j.p_title_enc; return send(null); }
    if (fn === 'ai_get_messages') { const s = sessions.get(j.p_session); if (!s || s.identity !== j.p_identity) return send([]); return send([...s.msgs].reverse().slice(0, j.p_limit).map((m, i) => ({ id: 'm' + i, role: m.role, content_enc: m.c, created_at: new Date().toISOString() }))); }
    if (fn === 'ai_list_sessions') return send([...sessions].filter(([, s]) => s.identity === j.p_identity && s.msgs.length).map(([id, s]) => ({ id, mode: 'talk', title_enc: s.title, last_activity_at: new Date().toISOString() })));
    if (fn === 'ai_delete_session') { const s = sessions.get(j.p_session); if (s?.identity === j.p_identity) sessions.delete(j.p_session); return send(null); }
    if (fn === 'ai_delete_all') { for (const [id, s] of sessions) if (s.identity === j.p_identity) sessions.delete(id); return send(null); }
    if (fn === 'ai_usage_today') return send([{ used: usage.get(j.p_identity) ?? 0, daily_limit: LIMIT }]);
    send(null);
  });
}).listen(54397, () => console.log('fake up'));
