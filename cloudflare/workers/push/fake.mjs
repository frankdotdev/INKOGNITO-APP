import http from 'node:http';
let queue = [], calls = [], pushes = [];
http.createServer((req, res) => {
  const chunks = []; req.on('data', d => chunks.push(d)); req.on('end', () => {
    const buf = Buffer.concat(chunks), send = (x, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(x)); };
    if (req.url === '/ctl/queue') { queue = JSON.parse(buf.toString()); calls = []; pushes = []; return send({}); }
    if (req.url === '/ctl/state') return send({ calls, pushes });
    if (req.url.startsWith('/push/')) { pushes.push({ path: req.url, headers: req.headers, body: buf.toString('base64') }); res.writeHead(req.url === '/push/gone' ? 410 : req.url === '/push/err' ? 500 : 201).end(); return; }
    const fn = req.url.split('/rpc/')[1], j = buf.length ? JSON.parse(buf.toString()) : {}; calls.push({ fn, args: j });
    if (fn === 'push_take_batch') { const q = queue; queue = []; return send(q); }
    send(null);
  });
}).listen(54394, () => console.log('fake up'));
