const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const Buttons=Object.fromEntries(['attack','altFire','reload','melee','parry','ability1','ability2','ability3','ultimate'].map((name,i)=>[name,1n<<BigInt(i)]));
const c={Buttons};vm.createContext(c);
vm.runInContext(stripTypeScriptTypes(fs.readFileSync('combat.ts','utf8').replace(/^import .*\r?\n/,'').replace('export function','function'))+'\nglobalThis.run=restrictCombat',c);
for(let slot=0;slot<4;slot++){
 let mask=0n,changes=[];const hook={name:'citadel_ability_hook',slot,upgrades:1,cooldownStart:10,cooldownEnd:30};
 const p={abilities:()=>[hook],blockInput:m=>{mask=m},setAbility:o=>changes.push(o)};c.run(p,11);
 const keys=['ability1','ability2','ability3','ultimate'];assert.equal(mask&Buttons[keys[slot]],0n);
 for(const name of ['attack','altFire','melee',...keys.filter((_,i)=>i!==slot)])assert.notEqual(mask&Buttons[name],0n);
 assert.equal(changes[0].upgrades,15);assert.equal(changes[1].cooldownEnd,13);
 hook.upgrades=15;hook.cooldownEnd=13;changes=[];c.run(p,12);assert.equal(changes.length,0);
}
console.log('PASS: fire/melee/other skills blocked, actual hook slot allowed, cooldown 3s, full upgrades enforced');

const changes = []
const abilities = [{name:'citadel_ability_hook', slot:2, upgrades:15},
  {name:'another_skill',slot:1,upgrades:7},{name:'upgrade_warp_stone',slot:4,upgrades:1}]
c.run({abilities:()=>abilities,blockInput(){},setAbility:opts=>changes.push(opts)},100)
assert.equal(changes.length,1)
assert.equal(changes[0].ability,'another_skill')
assert.equal(changes[0].upgrades,0)
