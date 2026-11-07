// Share only the read-only Panorama stream. Modlock still owns the game server.
const http = require('node:http')
const ip = process.argv[2]
if (!ip) throw new Error('Usage: node share.cjs HOST_IP')
http.createServer((req, res) => {
  if (!['/panorama/stream', '/panorama/stream?encoding=binary'].includes(req.url)) {
    res.writeHead(404).end()
    return
  }
  res.setHeader('Access-Control-Allow-Origin', 'https://hyperline.gg')
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
  if (req.method !== 'GET') { res.writeHead(405).end(); return }
  const upstream = http.get({ hostname: '127.0.0.1', port: 4320, path: req.url }, stream => {
    res.writeHead(stream.statusCode, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
    res.flushHeaders()
    stream.on('error', () => res.destroy())
    stream.pipe(res)
  })
  upstream.on('error', () => {
    if (res.headersSent) res.destroy()
    else res.writeHead(503).end('Modlock HUD offline')
  })
  res.on('close', () => upstream.destroy())
}).listen(4321, ip, () => console.log('Sharing arena HUD on ' + ip + ':4321'))
