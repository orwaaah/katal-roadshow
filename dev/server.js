// Local test server: static site on :8080, mock Apps Script API on :8081.
// Usage: node dev/server.js   then open http://localhost:8080/?api=http://localhost:8081/exec
const http = require('http');
const fs = require('fs');
const path = require('path');
const { makeContext } = require('./gas-mock');

const state = { quiet: true };
const G = makeContext(state);
G.setup();
let offline = false;

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
}).listen(8080);

http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (req.url.startsWith('/__dump')) { res.writeHead(200, cors); return res.end(JSON.stringify(Object.fromEntries(state.ss.sheets.map(s => [s.name, s.data])))); }
  if (req.url.startsWith('/__offline')) { offline = req.url.includes('on'); res.writeHead(200, cors); return res.end('{"offline":' + offline + '}'); }
  if (req.url.startsWith('/__adminpin')) { res.writeHead(200, cors); return res.end(JSON.stringify({ pin: state.ss.getSheetByName('Admins').data[1][1] })); }
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    if (offline) { req.socket.destroy(); return; }
    const delay = 300 + Math.random() * 400; // emulate Apps Script latency
    setTimeout(() => {
      const out = req.method === 'POST' ? G.doPost({ postData: { contents: body } }) : G.doGet({ parameter: {} });
      res.writeHead(200, cors);
      res.end(out.getContent());
    }, delay);
  });
}).listen(8081);
console.log('static http://localhost:8080  api http://localhost:8081/exec');
