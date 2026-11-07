import { command, onWorld, onFrame, onPlayerJoin, onPlayerLeave, players, readField, killEntity, addBot, findHero, type Player } from 'modlock'
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
const pickerEnabled = new Set<Player>()
const lobbyRetry = new Map<Player, number>()
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
  rounds.loadSpawns()
  rounds.startMapHud()
  seats.fill(undefined)
  warpStoneGrants.clear()
  lobbyRetry.clear()
  pickerEnabled.clear()
  setServerVariable('citadel_server_max_spectator_slots', 8)
  caught.fill(undefined)
  practiceBot = undefined
})

function point(side: number): void {
  if (winner) return
  scores[side - 1] += 1
  if (scores[side - 1] >= target) winner = side
}

function joinSide(player: Player, args: string): void {
  console.log('[Hook Arena] hookjoin received, slot', player.slot, 'side', args.slice(0, 8))
  const index = args === '1' ? 0 : args === '2' ? 1 : -1
  if (index < 0) { player.chat('Usage: /hookjoin 1 or /hookjoin 2'); return }
  if (seats[index] && seats[index] !== player) {
    player.chat('[Hook Arena] Side occupied. Its player can use /hookleave.')
    return
  }
  if (seats[index] === player) { player.chat(`[Hook Arena] You are P${index + 1}`); return }
  if (!['waiting', 'finished', 'error'].includes(rounds.phase)) {
    player.chat('Дождись конца матча или используй /hookleave.')
    return
  }
  const hero = findHero('Bebop')
  if (!hero || player.selectHero(hero.name, index + 2) === undefined) {
    console.log('[Hook Arena] selecting Bebop failed, slot', player.slot, 'team', index + 2)
    player.chat('Не удалось выбрать Bebop. Повтори /hookjoin через секунду.')
    return
  }
  occupySide(player, index)
}
command('hookjoin', joinSide)

function occupySide(player: Player, index: number): void {
  lobbyRetry.delete(player)
  const previous = seats.indexOf(player)
  if (previous >= 0) seats[previous] = undefined
  seats[index] = player
  reset()
  caught.fill(undefined)
  announce(`[Hook Arena] Player slot ${player.slot} joined P${index + 1}. Нажми «Готов», когда появится Bebop.`)
}

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
function leaveToSpectators(player: Player): void {
  leave(player)
  lobbyRetry.set(player, 0)
}
command('hookleave', leaveToSpectators)
onPlayerJoin((event) => rounds.forgetHud(event.connection.player))
onPlayerLeave((event) => {
  pickerEnabled.delete(event.connection.player)
  lobbyRetry.delete(event.connection.player)
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
  announce('[Hook Arena] You are P1; bot is ready as P2. Type /ready to start.')
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
  for (const connection of players()) {
    if (!connection.ready || connection.bot || seats.includes(connection.player)) continue
    const retry = lobbyRetry.get(connection.player)
    if (retry === Infinity) {
      const pawn = connection.player.pawn()
      if (!pawn || (pawn.team !== 2 && pawn.team !== 3)) {
        pickerEnabled.add(connection.player)
        continue
      }
      if (!pickerEnabled.has(connection.player) || pawn.health <= 0) continue
      const index = pawn.team - 2
      if (!connection.player.abilities().some(a => a.name === 'citadel_ability_hook')) continue
      if (!seats[index] && ['waiting', 'error', 'finished'].includes(rounds.phase)) {
        occupySide(connection.player, index)
        continue
      }
      connection.player.chat('Эта сторона занята. Выбери свободную сторону.')
      lobbyRetry.set(connection.player, 0)
    } else if (retry !== undefined && timeSeconds < retry) continue
    pickerEnabled.delete(connection.player)
    const entered = connection.player.spectate()
    lobbyRetry.set(connection.player, entered ? Infinity : timeSeconds + 1)
    if (entered) connection.player.chat('Ты наблюдатель. Нажми P1 или P2 на панели арены. Затем напиши /ready.')
  }
  for (const player of seats) {
    if (!player) continue
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
  for (const player of seats) {
    if (player) restrictCombat(player, timeSeconds, rounds.phase !== 'live')
  }
  rounds.draw(players(), seats, scores, timeSeconds, joinSide, ready, leaveToSpectators)
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
      if (winner) {
        for (const player of seats) {
          if (!player) continue
          player.blockInput(0n)
          warpStoneGrants.delete(player)
          if (player === practiceBot) { player.removeBot(); practiceBot = undefined }
          else lobbyRetry.set(player, 0)
        }
        seats.fill(undefined)
        announce('Матч окончен. Для следующей дуэли: /hookjoin 1 или /hookjoin 2.')
      }
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
command('help', (player) => {
  for (const line of [
    '/hookjoin 1 или /hookjoin 2 — занять сторону за Bebop; /hookleave — наблюдать.',
    '/ready — готов; /unready — отменить готовность.',
    '/hookscore — счёт; /hookhud — обновить HUD; /help — команды.',
    '/hookbot — тренировка; /removehookbot — убрать бота.',
    '/spawnadd — записать позицию; /spawnclear — очистить точки.',
    '/resetarena — сброс матча; /testpoint [1|2] — тест очка; /hello — тест связи.',
  ]) player.chat(line)
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

command('resetarena', (player) => {
  if (seats.some(Boolean) && !seats.includes(player)) { player.chat('Сброс доступен участникам дуэли.'); return }
  reset()
  announce(scoreText())
})

command('spawnadd', (player) => player.chat(`[Hook Arena] ${rounds.addSpawn(player)}`))
command('spawnclear', (player) => {
  if (seats.some((seat) => seat !== undefined)) {
    player.chat('[Hook Arena] Remove the bot and /hookleave before clearing spawns.')
    return
  }
  player.chat(rounds.clearSpawns() ? '[Hook Arena] Spawn pool cleared.' : '[Hook Arena] Could not save. Pool unchanged.')
})
