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

for (let slot = 4; slot <= 7; slot++) {
 const carpet={name:'upgrade_magic_carpet',slot,cooldownEnd:0}
 let mask=0n, writes=[]
 c.run({abilities:()=>[carpet],blockInput:m=>{mask=m},setAbility:o=>writes.push(o)},100)
 const itemBits=15n<<37n
 assert.equal(mask&itemBits,1n<<BigInt(37+slot-4))
 assert.deepEqual([writes[0].ability,writes[0].cooldownEnd],[carpet.name,160])
}
