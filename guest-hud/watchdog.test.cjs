const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict')
const { Screen, packed } = require('../deploy/hud-feed.cjs')
const source = fs.readFileSync(__dirname+'/panorama-source/panorama/scripts/modlock/ui.js','utf8')
const start = source.indexOf('Ie=class'), end = source.indexOf(';var Ae=',start)
assert.ok(start > 0 && end > start)
let now=0, next=0, valid=true, urls=[], drawn=[], timers=new Map()
const panel={IsValid:()=>valid,SetURL:url=>urls.push(url)}
const c={p:(o,k,v)=>o[k]=v,Date:{now:()=>now},li:10,gt:'modlock:frame:',
  pn:s=>Uint8Array.from([...s],c=>c.charCodeAt(0)>=256?c.charCodeAt(0)-256:c.charCodeAt(0)),
  hn:{fromBinary:b=>Screen.decode(b)}, $:{RegisterEventHandler(){},Msg(){},
    Schedule:(delay,callback)=>{timers.set(++next,callback);return next},CancelScheduled:id=>timers.delete(id)}}
vm.createContext(c);vm.runInContext('globalThis.Bridge='+source.slice(start+3,end),c)
const bridge=new c.Bridge(panel,'https://hyperline.gg/app/relay/bridge.html?port=4320',s=>drawn.push(s))
bridge.read('modlock:bridge-ready')
now=16000;bridge.watch();assert.equal(urls.length,2)
assert.notEqual(urls[0],urls[1])
const line=packed({trees:[{mod:'bebop-cup',nodes:[{id:'',children:['a']},{id:'a',text:'Ready'}]}]},1)
const text=line.slice(line.indexOf(':')+1,-1)
bridge.read('modlock:frame:1:0:'+text.length+':1:'+text)
assert.equal(drawn[0].trees[0].nodes[1].text,'Ready')
now=20000;const before=urls.length;bridge.watch();assert.equal(urls.length,before)
// Empty snapshots must acknowledge: the player may not have joined yet.
bridge.read('modlock:frame:2:0:0:2:');assert.equal(drawn[1].trees.length,0)
valid=false;now=60000;const count=urls.length;bridge.watch();bridge.load();assert.equal(urls.length,count)
console.log('PASS: stalled page reloads, valid frames stop reloads, empty snapshots acknowledged, destroyed panels stop retrying')
