const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
let draws=0; let cover=true;
let clears=0;
let stored, writable = true;
const context={readFile:()=>stored,writeFile:(name,text)=>{if (!writable) return false;stored=text;return true},hide:()=>{clears++;return true},jsx:(type,props)=>({type,props}),countdown:(round,remaining)=>({round,remaining}),hideHud:()=>true,Layers:{staticLevel:1n},trace:({start,end})=>cover?{startSolid:false,position:{x:(start.x+end.x)/2,y:(start.y+end.y)/2,z:start.z}}:undefined,show:()=>{draws++;return true},TopStrip:x=>x,Score:x=>x,Banner:x=>x};
vm.createContext(context);
vm.runInContext(stripTypeScriptTypes(fs.readFileSync('rounds.ts','utf8').replace(/^import .*\r?\n/gm,'').replace('export class Rounds','class Rounds'))+'\nglobalThis.flow=new Rounds()',context);
function player(team,x){return {state:{team,health:100,position:{x,y:0,z:0},eyeAngles:{pitch:0,yaw:0,roll:0}},frozen:false,revives:0,blockInput(){return true},pawn(){return this.state},abilities(){return [{name:'citadel_ability_hook'}]},freeze(v){this.frozen=v;return true},teleport(p){this.state.position={...p};return true},refreshAbility(name){assert.equal(name,'upgrade_warp_stone');return true},setAbility(settings){this.hookEnd=settings.cooldownEnd;return true},respawn(){this.revives++;this.state.health=100;return true}}}
const a=player(2,0),b=player(3,300),r=context.flow,seats=[a,b];
for(const x of [0,1000,2000,3000]){a.state.position.x=x;r.addSpawn(a)}
r.update(seats,0);assert.equal(r.phase,'waiting');r.setReady(a,true);r.update(seats,0);assert.equal(r.phase,'waiting');r.setReady(a,false);assert.equal(r.isReady(a),false);r.setReady(a,true);r.setReady(b,true);r.update(seats,0);assert.equal(r.phase,'countdown');assert.ok(!a.frozen&&!b.frozen);assert.equal(a.hookEnd,3);assert.equal(b.hookEnd,3);
r.update(seats,2.9);assert.equal(r.phase,'countdown');r.update(seats,3);assert.equal(r.phase,'live');assert.ok(!a.frozen&&!b.frozen);
b.state.health=0;r.end(1,false,4);assert.equal(r.phase,'break');r.update(seats,5.9);assert.equal(b.revives,0);
r.update(seats,6);assert.equal(b.revives,1);r.update(seats,6.3);assert.equal(r.phase,'countdown');assert.ok(Math.abs(a.state.position.x-b.state.position.x)>=800);
r.update(seats,9.3);assert.equal(r.phase,'live');r.replay(10);r.update(seats,10);assert.equal(r.number,2);assert.ok(Math.abs(a.state.position.x-b.state.position.x)>=800);
r.end(1,true,11);assert.equal(r.phase,'finished');r.update(seats,20);assert.equal(r.phase,'finished');assert.ok(!a.frozen&&!b.frozen);
const viewers=[{player:a,name:'A',ready:true,bot:false}];r.draw(viewers,seats,[10,0],20);r.draw(viewers,seats,[10,0],21);assert.equal(draws,1);assert.equal(clears,1);
r.forgetHud(a);r.draw(viewers,seats,[10,0],21);assert.equal(draws,2);assert.equal(clears,2);
r.reset();assert.equal(r.phase,'waiting');assert.equal(r.number,1);
assert.equal(r.isReady(a),false);assert.equal(r.isReady(b),false);r.setReady(a,true);r.setReady(b,true);a.teleport=()=>false;r.update(seats,30);r.update(seats,39);assert.equal(r.phase,'error');assert.ok(!a.frozen&&!b.frozen);
r.reset();r.setReady(a,true);r.setReady(b,true);cover=false;r.update(seats,40);assert.equal(r.phase,'error');assert.ok(!a.frozen&&!b.frozen);
console.log('PASS: countdown, mobile countdown, delayed respawn, swapped positions, no-point replay, match finish, HUD deduplication, reset, failure cleanup');




const fresh = vm.runInContext('new Rounds()',context)
fresh.loadSpawns()
assert.equal(fresh.addSpawn(a),'Too close to an existing spawn.')
assert.equal(JSON.parse(stored).length,4)
a.state.position.x=5000
writable=false
assert.match(fresh.addSpawn(a),/unchanged/)
assert.equal(fresh.clearSpawns(),false)
assert.equal(JSON.parse(stored).length,4)
writable=true
stored='broken'
fresh.loadSpawns()
assert.match(fresh.addSpawn(a),/damaged/)
assert.equal(stored,'broken')
assert.equal(fresh.clearSpawns(),true)
fresh.loadSpawns()
assert.match(fresh.addSpawn(a),/Spawn 1 saved/)
assert.deepEqual(JSON.parse(stored)[0],{position:a.state.position,facing:a.state.eyeAngles})
console.log('PASS: spawn persistence, failed writes, damaged file and explicit clear')
