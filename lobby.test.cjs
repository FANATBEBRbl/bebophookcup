const fs = require('node:fs')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { stripTypeScriptTypes } = require('node:module')
const commands = new Map()
let frame, join, leave, victim, hookVictim
const viewers = Array.from({ length: 8 }, (_, slot) => {
  const player = {
    slot, team: 0, spectators: 0, messages: [],
    spectate() { this.team = 1; this.spectators++; return true },
    selectHero(hero, team) { this.team = team; return 7 },
    chat(message) { this.messages.push(message) },
    pawn() { return this.team > 1 ? {entity: slot + 20, health: this === victim ? 0 : 100, team: this.team} : undefined },
    abilities() { return [{name: 'citadel_ability_hook', entity: 100 + slot}] },
    giveItem() { return true }, blockInput() { return true },
  }
  return { player, ready: true, bot: false }
})
const context = {
  command: (name, fn) => commands.set(name, fn), onWorld() {}, onFrame(fn) { frame = fn },
  onPlayerJoin(fn) { join = fn }, onPlayerLeave(fn) { leave = fn },
  players: () => viewers, findHero: () => ({name:'Bebop'}), restrictCombat() {},
  Rounds: class {
    phase = 'waiting'
    reset() { this.phase = 'waiting' }
    end(side, won) { this.phase = won ? 'finished' : 'break' }
    update() {} draw() {} forgetHud() {}
  },
  readField(entity) { return entity === 100 ? hookVictim : undefined },
  killEntity() { victim = viewers[1].player; return true },
}
vm.createContext(context)
const source = fs.readFileSync('main.ts','utf8').replace(/^import .*\r?\n/gm,'')
vm.runInContext(stripTypeScriptTypes(source) + '\nglobalThis.duel = rounds; globalThis.matchPoint = () => scores[0] = 9', context)
const tick = timeSeconds => frame({timeSeconds})
const chat = (slot, name, arg = '') => commands.get(name)(viewers[slot].player, arg)
tick(0); tick(1)
assert.ok(viewers.every(v => v.player.team === 1 && v.player.spectators === 1))
chat(0,'hookjoin','1'); chat(1,'hookjoin','2'); chat(2,'hookjoin','1')
assert.deepEqual(viewers.map(v => v.player.team), [2,3,1,1,1,1,1,1])
chat(2,'help')
const help = viewers[2].player.messages.join(' ')
for (const cmd of commands.keys()) assert.ok(help.includes('/' + cmd), cmd)
context.duel.phase = 'live'; context.matchPoint()
hookVictim = 21; tick(2); tick(2.1); tick(2.2)
assert.equal(context.duel.phase, 'finished')
assert.ok(viewers.every(v => v.player.team === 1))
tick(3); viewers[3].player.team = 2; viewers[4].player.team = 3; tick(4)
viewers[5].player.team = 2; tick(5)
assert.ok(viewers[3].player.messages.some(line => line.includes('joined P1')))
assert.deepEqual(viewers.map(v => v.player.team), [1,1,1,2,3,1,1,1])
console.log('PASS: eight spectators, team assignment, occupied seat, help coverage, match rotation')
