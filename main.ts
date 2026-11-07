import { command, onChat, onWorld, onFrame, onPlayerJoin, onPlayerLeave, players, readField, killEntity, addBot, findHero, type Player } from 'modlock'
import { set as setServerVariable } from 'modlock/console'
import { Rounds } from './rounds'
import { restrictCombat } from './combat'

const rounds = new Rounds()

const target = 10
// Temporary arena sides, independent of the game's teams and player slots.
let scores = [0, 0]
let winner = 0
const seats: (Player | undefined)[] = [undefined, undefined]
const warpStoneGrants = new Map<Player, { entity: number; retryAt: number }>()
const caught: (number | undefined)[] = [undefined, undefined]
let practiceBot: Player | undefined
let pending: { side: number; victim: Player; entity: number; until: number } | undefined

function scoreText(): string {
  return `[Hook Arena] P1 ${scores[0]} : ${scores[1]} P2 | First to ${target}`
    + (winner ? ` | Winner: P${winner}. /resetarena` : '')
}

function announce(text: string): void {
  for (const connection of players()) {
    if (connection.ready && !connection.bot) connection.player.chat(text)
  }
}

function reset(): void {
  rounds.reset()
  scores = [0, 0]
  winner = 0
  pending = undefined
  if (practiceBot && seats.includes(practiceBot)) rounds.setReady(practiceBot, true)
  // Keep catch latches until the hook releases, including across a score reset.
}

onWorld(() => {
  // Local map testing; disable before running the tournament.
  console.log('[Hook Arena] sv_cheats=1 request accepted:', setServerVariable('sv_cheats', true))
  console.log('[Hook Arena] Allow duplicate heroes:', setServerVariable('citadel_allow_duplicate_heroes', true))
  reset()
  rounds.clearSpawns()
  rounds.startMapHud()
  seats.fill(undefined)
  warpStoneGrants.clear()
  caught.fill(undefined)
  practiceBot = undefined
})

function point(side: number): void {
  if (winner) return
  scores[side - 1] += 1
  if (scores[side - 1] >= target) winner = side
}

command('hookjoin', (player, args) => {
  const index = args === '1' ? 0 : args === '2' ? 1 : -1
  if (index < 0) { player.chat('Usage: /hookjoin 1 or /hookjoin 2'); return }
  if (seats[index] && seats[index] !== player) {
    player.chat('[Hook Arena] Side occupied. Its player can use /hookleave.')
    return
  }
  if (seats[index] === player) { player.chat(`[Hook Arena] You are P${index + 1}`); return }
  const previous = seats.indexOf(player)
  if (previous >= 0) seats[previous] = undefined
  seats[index] = player
  reset()
  caught.fill(undefined)
  announce(`[Hook Arena] Player slot ${player.slot} joined P${index + 1}. Score reset. Both sides must join; use Bebop on opposing teams.`)
})

function leave(player: Player): void {
  warpStoneGrants.delete(player)
  player.blockInput(0n)
  const index = seats.indexOf(player)
  if (index < 0) return
  seats[index] = undefined
  reset()
  caught.fill(undefined)
  announce('[Hook Arena] Participant left. Hooks paused; score reset.')
}
command('hookleave', (player) => leave(player))
onPlayerJoin((event) => rounds.forgetHud(event.connection.player))
onPlayerLeave((event) => {
  rounds.forgetHud(event.connection.player)
  leave(event.connection.player)
})

command('hookbot', (player) => {
  const pawn = player.pawn()
  if (!pawn || pawn.health <= 0 || (pawn.team !== 2 && pawn.team !== 3)
    || !player.abilities().some((ability) => ability.name === 'citadel_ability_hook')) {
    player.chat('[Hook Arena] Spawn as a living Bebop first.')
    return
  }
  if (practiceBot) {
    player.chat('[Hook Arena] Practice bot already exists. /removehookbot then /hookbot to replace it.')
    return
  }
  if (seats.some((seat) => seat && seat !== player)) {
    player.chat('[Hook Arena] Another participant is registered. They must /hookleave first.')
    return
  }
  const hero = findHero('Bebop')
  if (!hero) { player.chat('[Hook Arena] Bebop missing from hero catalog.'); return }
  const yaw = pawn.eyeAngles.yaw * Math.PI / 180
  const bot = addBot({ name: 'Hook Target', team: pawn.team === 2 ? 3 : 2, hero: hero.name,
    position: { x: pawn.position.x + Math.cos(yaw) * 300,
      y: pawn.position.y + Math.sin(yaw) * 300, z: pawn.position.z + 10 } })
  if (!bot) { player.chat('[Hook Arena] addBot failed. Check server.log.'); return }
  practiceBot = bot
  seats[0] = player
  seats[1] = bot
  reset()
  caught.fill(undefined)
  announce('[Hook Arena] You are P1; bot is ready as P2. Type !ready to start.')
})

command('removehookbot', (player) => {
  if (!practiceBot) { player.chat('[Hook Arena] No practice bot.'); return }
  const bot = practiceBot
  if (!bot.removeBot()) { player.chat('[Hook Arena] Could not remove bot.'); return }
  practiceBot = undefined
  leave(bot)
  player.chat('[Hook Arena] Practice bot removed.')
})

onFrame(({ timeSeconds }) => {
  for (const player of seats) {
    if (!player) continue
    restrictCombat(player, timeSeconds)
    const pawn = player.pawn()
    if (!pawn || pawn.health <= 0) {
      warpStoneGrants.delete(player)
      continue
    }
    const grant = warpStoneGrants.get(player)
    if (grant?.entity === pawn.entity && timeSeconds < grant.retryAt) continue
    const granted = player.giveItem('upgrade_warp_stone')
    warpStoneGrants.set(player, { entity: pawn.entity, retryAt: granted ? Infinity : timeSeconds + 1 })
  }
  rounds.update(seats, timeSeconds)
  rounds.draw(players(), seats, scores, timeSeconds)
  if (rounds.phase !== 'live') {
    for (let i = 0; i < 2; i++) {
      const ability = seats[i]?.abilities().find((a) => a.name === 'citadel_ability_hook')
      const handle = ability ? readField(ability.entity, 'CCitadel_Ability_Hook', 'm_hHookVictim', 'handle') : undefined
      caught[i] = typeof handle === 'number' ? handle : undefined
    }
    return
  }
  if (pending) {
    const pawn = pending.victim.pawn()
    if (pawn && pawn.entity === pending.entity && pawn.health <= 0) {
      point(pending.side)
      rounds.end(pending.side, winner !== 0, timeSeconds)
      announce(`[HOOK +1 P${pending.side}] ${scoreText()}`)
      pending = undefined
    } else if (timeSeconds >= pending.until || (pawn && pawn.entity !== pending.entity)) {
      announce('[Hook Arena] Death not confirmed; no point awarded.')
      pending = undefined
    }
    return
  }
  if (winner || !seats[0] || !seats[1]) return
  // A non-hook death replays the round without awarding a point.
  if (seats.some((p) => { const pawn = p!.pawn(); return pawn && pawn.health <= 0 })) {
    rounds.replay(timeSeconds)
    return
  }
  for (let index = 0; index < 2; index++) {
    const attacker = seats[index]!
    const victim = seats[1 - index]!
    const a = attacker.pawn()
    const v = victim.pawn()
    if (!a || a.health <= 0) continue
    const ability = attacker.abilities().find((entry) => entry.name === 'citadel_ability_hook')
    if (!ability) { caught[index] = undefined; continue }
    const handle = readField(ability.entity, 'CCitadel_Ability_Hook', 'm_hHookVictim', 'handle')
    const current = typeof handle === 'number' ? handle : undefined
    const previous = caught[index]
    caught[index] = current
    if (current === previous || !v || v.health <= 0 || current !== v.entity || a.team === v.team) continue
    // Only registered opponents with Bebop's hook participate.
    if (!victim.abilities().some((entry) => entry.name === 'citadel_ability_hook')) continue
    if (!killEntity({ victim: v.entity, attacker: a.entity, ability: ability.entity })) {
      announce('[Hook Arena] Hook detected, but killEntity failed; no point awarded.')
      continue
    }
    pending = { side: index + 1, victim, entity: v.entity, until: timeSeconds + 1 }
    return
  }
})

// Greet each player who types /hello in chat.
command('hello', (player) => {
  player.chat('Hello from Bebop Cup!')
})

command('hookhud', (player) => {
  rounds.forgetHud(player)
  player.chat('[Hook Arena] Full HUD refresh requested.')
})

command('hookscore', (player) => {
  player.chat(scoreText())
})

function ready(player: Player, value: boolean): void {
  if (!seats.includes(player)) { player.chat('[Hook Arena] Join first: /hookjoin 1 or /hookjoin 2, or /hookbot'); return }
  if (rounds.phase !== 'waiting') { player.chat('[Hook Arena] Ready can only change before the match. /resetarena'); return }
  const pawn = player.pawn()
  if (value && (!pawn || pawn.health <= 0 || !player.abilities().some((a) => a.name === 'citadel_ability_hook'))) {
    player.chat('[Hook Arena] You must be a living Bebop.'); return
  }
  rounds.setReady(player, value)
  player.chat(value ? '[Hook Arena] READY' : '[Hook Arena] NOT READY')
}
command('ready', (player) => ready(player, true))
command('unready', (player) => ready(player, false))
// Modlock's command prefix parser does not promise support for !.
onChat(({ player, text }) => {
  const message = text.trim().toLowerCase()
  if (message === '!ready') ready(player, true)
  else if (message === '!unready') ready(player, false)
})

command('testpoint', (player, args) => {
  if (seats.some((seat) => seat !== undefined)) {
    player.chat('[Hook Arena] Test points disabled while participants are registered. /hookleave')
    return
  }
  const side = args === '' || args === '1' ? 1 : args === '2' ? 2 : 0
  if (!side) {
    player.chat('[Hook Arena] Usage: /testpoint [1|2]')
    return
  }
  if (winner) {
    player.chat(scoreText())
    return
  }
  point(side)
  announce(`[TEST +1 P${side}] ${scoreText()}`)
})

command('resetarena', () => {
  reset()
  announce(scoreText())
})

command('spawnadd', (player) => player.chat(`[Hook Arena] ${rounds.addSpawn(player)}`))
command('spawnclear', (player) => {
  if (seats.some((seat) => seat !== undefined)) {
    player.chat('[Hook Arena] Remove the bot and /hookleave before clearing spawns.')
    return
  }
  rounds.clearSpawns()
  player.chat('[Hook Arena] Spawn pool cleared.')
})
