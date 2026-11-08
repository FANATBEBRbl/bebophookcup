const assert = require('node:assert/strict')
const { once } = require('node:events')
const { HudFeed, packed, Screen } = require('./hud-feed.cjs')
const feed = new HudFeed()
const ids = ['76561198848638951', '76561198000000001', '76561198000000002']
const join = (slot, steamId) => feed.handle({host:{joined:{slot, steamId}}})
const draw = (slot, text, reset = false) => feed.handle({host:{ui:{slot, mod:'bebop-cup', change:{reset,
  set:[{id:'', kind:'KIND_PANEL', children:['label']},{id:'label', kind:'KIND_LABEL',text}]}}}})
function decode(line) {
  const text = line.trimEnd().slice(line.indexOf(':') + 1)
  return Screen.toObject(Screen.decode(Uint8Array.from([...text], c => {
    const n = c.charCodeAt(0); return n >= 256 ? n - 256 : n
  })), {longs:String, enums:String})
}
async function main() {
  ids.forEach((id, slot) => {join(slot,id);draw(slot,['Join Duel','Ready','Spectate'][slot])})
  const server = feed.serve({port:0,host:'127.0.0.1'})
  await once(server,'listening')
  const base = 'http://127.0.0.1:'+server.address().port
  const readers = []
  async function connect(id) {
    const response = await fetch(base+'/panorama/stream?steamid='+id)
    assert.equal(response.status,200)
    const reader = response.body.getReader();readers.push(reader)
    const decoder = new TextDecoder();let buffer=''
    return async () => {
      while(!buffer.includes('\n')) {
        const {value,done}=await reader.read();assert.equal(done,false)
        buffer+=decoder.decode(value,{stream:true})
      }
      const at=buffer.indexOf('\n'),line=buffer.slice(0,at);buffer=buffer.slice(at+1)
      return decode(line)
    }
  }
  try {
    const next = await Promise.all(ids.map(connect))
    const first = await Promise.all(next.map(n=>n()))
    assert.deepEqual(first.map(s=>s.trees[0].nodes[1].text),['Join Duel','Ready','Spectate'])
    draw(0,'Ready')
    assert.equal((await next[0]()).trees[0].nodes[1].text,'Ready')
    assert.equal((await next[1]()).trees[0].nodes[1].text,'Ready') // heartbeat with no UI change
    const late=await connect(ids[0]);assert.equal((await late()).trees[0].nodes[1].text,'Ready')
    feed.handle({host:{left:{slot:0}}})
    assert.equal(feed.screen(ids[0]).trees.length,0)
    join(0,'76561198000000003');assert.equal(feed.screen('76561198000000003').trees.length,0)
    join(4,ids[0]);draw(4,'Rejoined')
    assert.equal(feed.screen(ids[0]).trees[0].nodes[1].text,'Rejoined')
    const old=feed.screen(ids[0]).trees[0].generation
    feed.handle({host:{ui:{slot:4,mod:'bebop-cup',change:{reset:true}}}});draw(4,'Fresh')
    assert.notEqual(feed.screen(ids[0]).trees[0].generation,old)
    const roundtrip=decode(packed(feed.screen(ids[0]),1))
    assert.equal(roundtrip.trees[0].generation,feed.screen(ids[0]).trees[0].generation)
    assert.equal((await fetch(base+'/panorama/stream')).status,400)
    feed.reset();assert.equal(feed.screen(ids[1]).trees.length,0)
    console.log('PASS: three independent HUDs, immediate late join, heartbeat, slot reuse, reconnect, reset and uint64 wire encoding')
  } finally {
    await Promise.all(readers.map(r=>r.cancel()))
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
  }
}
main().catch(err=>{console.error(err);process.exitCode=1})
