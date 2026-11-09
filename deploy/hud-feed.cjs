// Per-player HUD from Modlock --json HostEvent, never the host's loopback screen.
const http = require('node:http')
const crypto = require('node:crypto')
const protobuf = require('./vendor/protobuf.cjs')
protobuf.util.Long = require('./vendor/long.cjs')
protobuf.configure()
const Screen = protobuf.Root.fromJSON(require('./vendor/ui-schema.json')).lookupType('modlock.wasm.ui.Screen')
const generation = () => crypto.randomBytes(8).readBigUInt64LE().toString()

function packed(screen, sequence) {
  const encoded = Screen.encode(Screen.fromObject(screen)).finish()
  // The HTTPS bridge emits no title parts for a zero-byte message. A harmless
  // unknown protobuf field lets an empty screen clear stale UI and heartbeat.
  const bytes = encoded.length ? encoded : Uint8Array.of(0xf8, 0x07, 0)
  let text = '~' + sequence + ':'
  for (const b of bytes) text += String.fromCharCode(b > 32 && b < 127 && b !== 92 ? b : b + 256)
  return text + '\n'
}

class HudFeed {
  players = new Map()
  trees = new Map()
  clients = new Set()
  reset() { this.players.clear(); this.trees.clear(); this.publish() }
  handle(event) {
    const h = event.host
    if (!h) return
    if (h.joined) {
      const slot = h.joined.slot || 0
      // A reused slot must not inherit its previous owner's panels.
      this.trees.delete(slot)
      this.players.set(slot, String(h.joined.steamId || '0'))
    } else if (h.left) {
      const slot = h.left.slot || 0
      this.players.delete(slot); this.trees.delete(slot)
    } else if (h.ui) {
      const { mod, change = {} } = h.ui, slot = h.ui.slot || 0
      if (mod !== 'bebop-cup') return
      if (!this.trees.has(slot)) this.trees.set(slot, new Map())
      const mods = this.trees.get(slot)
      let tree = mods.get(mod)
      if (!tree) mods.set(mod, tree = { generation: generation(), nodes: new Map() })
      if (change.reset) {
        tree.nodes.clear()
        if (!change.set?.length) tree.generation = generation()
      }
      if (change.generation && change.generation !== '0') tree.generation = String(change.generation)
      for (const node of change.set || []) tree.nodes.set(node.id || '', node)
      for (const id of change.removed || []) tree.nodes.delete(id)
    } else return
    this.publish()
  }
  screen(account) {
    for (const [slot, id] of this.players) if (id === account) {
      return { trees: [...(this.trees.get(slot) || [])].filter(([, t]) => t.nodes.size)
        .map(([mod, t]) => ({ mod, generation: t.generation, nodes: [...t.nodes.values()] })) }
    }
    return { trees: [] }
  }
  publish() { for (const client of this.clients) client.dirty = true }
  serve({ port = 4321, host = '0.0.0.0' } = {}) {
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', 'https://hyperline.gg')
      res.setHeader('Access-Control-Allow-Private-Network', 'true')
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
      if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
      const url = new URL(req.url, 'http://localhost')
      const account = url.searchParams.get('steamid')
      if (req.method !== 'GET' || url.pathname !== '/panorama/stream' || !/^7656119\d{10}$/.test(account || '')) {
        res.writeHead(400).end('This HUD requires the new player launcher.'); return
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
      res.flushHeaders()
      const client = { dirty: true }
      this.clients.add(client)
      let sequence = 0, blocked = false, lastSent = 0
      const send = () => {
        if (blocked || res.destroyed || (!client.dirty && Date.now() - lastSent < 2000)) return
        client.dirty = false; lastSent = Date.now()
        blocked = !res.write(packed(this.screen(account), ++sequence))
      }
      res.on('drain', () => { blocked = false; client.dirty = true; send() })
      res.on('error', () => res.destroy())
      const timer = setInterval(send, 100)
      res.on('close', () => { clearInterval(timer); this.clients.delete(client) })
      send()
    })
    server.listen(port, host)
    return server
  }
}
module.exports = { HudFeed, packed, Screen }
