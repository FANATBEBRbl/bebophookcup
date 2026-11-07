import { readFile, writeFile, hide, createEntity, fireInput, show, hideHud, trace, Layers, TopStrip, Score, jsx, type Player, type Vector, type Angles } from 'modlock'
import { countdown } from './countdown'

type Spawn = { position: Vector; facing: Angles }
const spawnFile = 'bebop_arena_small.spawns.v1.json'
function validSpawn(value: unknown): value is Spawn {
  if (!value || typeof value !== 'object' || !('position' in value) || !('facing' in value)) return false
  const { position, facing } = value as Spawn
  return !!position && !!facing && [position.x, position.y, position.z,
    facing.pitch, facing.yaw, facing.roll].every(Number.isFinite)
}

const phrases = ['DAVAI BRATAN', 'OPA HU4OK', 'SVEZHEE MYASO', 'IDI SYUDA',
  'LOVI PODAROK', 'NU VSE, PRIEHALI', 'BRATAN, NE PROMAHNIS', 'ETO MOI HU4OK']
export class Rounds {
  phase: 'waiting' | 'prepare' | 'countdown' | 'live' | 'break' | 'finished' | 'error' = 'waiting'
  number = 1
  private deadline = 0
  private nextTry = 0
  private placed = [false, false]
  private spawns: Spawn[] = []
  private pool: Spawn[] = []
  private previousPair = ''
  private members: Player[] = []
  private lastHud = new Map<Player, string>()
  private hudText: number | undefined
  private displayedText = ''
  private nextDisplay = 0

  startMapHud(): void {
    this.displayedText = ''
    this.nextDisplay = 0
    this.hudText = createEntity({
      designerName: 'game_text', subclass: '', team: 4, position: { x: 0, y: 0, z: 0 },
      keyValues: [
        { key: 'spawnflags', value: { integer: 1 } },
        { key: 'channel', value: { integer: 3 } },
        { key: 'x', value: { number: 0.03 } }, { key: 'y', value: { number: 0.24 } },
        { key: 'color', value: { color: 0xffdf87ff } },
        { key: 'holdtime', value: { number: 3 } },
      ],
    })
    console.log('[Hook Arena] Map HUD entity:', this.hudText)
  }
  private result = ''
  private phrase = phrases[0]
  private readyPlayers = new Set<Player>()

  setReady(player: Player, ready: boolean): void {
    if (ready) this.readyPlayers.add(player)
    else this.readyPlayers.delete(player)
  }

  isReady(player: Player | undefined): boolean { return !!player && this.readyPlayers.has(player) }

  private invalidSpawnFile = false

  loadSpawns(): void {
    this.previousPair = ''
    this.pool = []
    this.invalidSpawnFile = false
    const text = readFile(spawnFile)
    if (text === undefined) return
    try {
      const points: unknown = JSON.parse(text)
      if (!Array.isArray(points) || points.length > 32 || !points.every(validSpawn)) throw Error('invalid spawn list')
      this.pool = points
      console.log('[Hook Arena] Loaded spawn points:', points.length)
    } catch {
      this.invalidSpawnFile = true
      console.log('[Hook Arena] Invalid spawn file:', spawnFile)
    }
  }

  private saveSpawns(points: Spawn[]): boolean {
    if (!writeFile(spawnFile, JSON.stringify(points))) return false
    this.pool = points
    this.invalidSpawnFile = false
    return true
  }

  addSpawn(player: Player): string {
    if (this.invalidSpawnFile) return 'Saved spawn file is damaged. Use /spawnclear to replace it.'
    const pawn = player.pawn()
    if (!pawn || pawn.health <= 0) return 'Stand at a safe spawn location while alive.'
    if (this.phase !== 'waiting' && this.phase !== 'error' && this.phase !== 'finished') return 'Leave the arena before editing spawn points.'
    if (this.pool.length >= 32) return 'Limit: 32 spawn points.'
    if (this.pool.some((s) => Math.hypot(s.position.x - pawn.position.x, s.position.y - pawn.position.y, s.position.z - pawn.position.z) < 100)) return 'Too close to an existing spawn.'
    const point = { position: { ...pawn.position }, facing: { ...pawn.eyeAngles } }
    if (!validSpawn(point) || !this.saveSpawns([...this.pool, point])) return 'Could not save spawn. Pool unchanged.'
    return `Spawn ${this.pool.length} saved. Place at least 4, behind cover, 800+ units apart.`
  }

  clearSpawns(): boolean {
    if (!this.saveSpawns([])) return false
    this.reset()
    this.previousPair = ''
    return true
  }

  private choosePair(): boolean {
    if (this.pool.length < 4) return false
    const pairs: { a: number; b: number; key: string }[] = []
    for (let a = 0; a < this.pool.length; a++) for (let b = a + 1; b < this.pool.length; b++) {
      const p = this.pool[a].position, q = this.pool[b].position
      if (Math.hypot(p.x - q.x, p.y - q.y) < 800) continue
      // Require actual static cover at two heights, not a player standing in the way.
      const covered = [40, 80].every((height) => {
        const hit = trace({ start: { ...p, z: p.z + height }, end: { ...q, z: q.z + height }, layers: Layers.staticLevel })
        return hit !== undefined && !hit.startSolid && Math.hypot(hit.position.x - p.x, hit.position.y - p.y) > 50
          && Math.hypot(hit.position.x - q.x, hit.position.y - q.y) > 50
      })
      if (covered) pairs.push({ a, b, key: `${a}:${b}` })
    }
    if (!pairs.length) return false
    const different = pairs.filter((p) => p.key !== this.previousPair)
    const choices = different.length ? different : pairs
    const pair = choices[Math.floor(Math.random() * choices.length)]
    this.previousPair = pair.key
    this.spawns = Math.random() < 0.5 ? [this.pool[pair.a], this.pool[pair.b]] : [this.pool[pair.b], this.pool[pair.a]]
    return true
  }

  reset(): void {
    this.readyPlayers.clear()
    for (const player of this.members) player.blockInput(0n)
    this.members = []
    this.spawns = []
    this.phase = 'waiting'
    this.number = 1
    this.result = ''
    this.lastHud.clear()
  }

  end(side: number, won: boolean, now: number): void {
    this.result = won ? `P${side} WINS THE MATCH` : `P${side} WINS ROUND ${this.number}`
    this.phase = won ? 'finished' : 'break'
    this.deadline = now + 2
  }

  private prepare(now: number): void {
    const choices = phrases.filter((text) => text !== this.phrase)
    this.phrase = choices[Math.floor(Math.random() * choices.length)]
    if (!this.choosePair()) {
      this.phase = 'error'
      this.result = 'Need 4 /spawnadd points and a covered pair 800+ units apart; then /resetarena'
      return
    }
    this.phase = 'prepare'
    this.deadline = now + 8
    this.nextTry = now
    this.placed = [false, false]
  }

  replay(now: number): void {
    this.prepare(now)
  }

  update(seats: (Player | undefined)[], now: number): void {
    if (!seats[0] || !seats[1]) return
    if (this.phase === 'waiting') {
      if (!seats.every((p) => this.isReady(p))) return
      const pawns = seats.map((p) => p!.pawn())
      if (pawns.some((p) => !p || p.health <= 0)) return
      if (pawns[0]!.team === pawns[1]!.team) return
      if (seats.some((p) => !p!.abilities().some((a) => a.name === 'citadel_ability_hook'))) return
      this.members = [seats[0], seats[1]]
      this.prepare(now)
    }
    if (this.phase === 'break' && now >= this.deadline) {
      this.number++
      this.prepare(now)
    }
    if (this.phase === 'prepare') {
      if (now > this.deadline) {
        this.phase = 'error'
        this.result = 'Preparation failed — /resetarena'
        return
      }
      if (now < this.nextTry) return
      this.nextTry = now + 0.25
      for (let i = 0; i < 2; i++) {
        if (this.placed[i]) continue
        const player = this.members[i]
        const pawn = player.pawn()
        if (!pawn) continue
        if (pawn.health <= 0) { player.respawn(); continue }
        const spot = this.spawns[i]
        if (!player.teleport(spot.position, spot.facing, { x: 0, y: 0, z: 0 })) continue
        this.placed[i] = true
      }
      if (this.placed.every(Boolean)) {
        for (const player of this.members) {
          if (!player.refreshAbility('upgrade_warp_stone') ||
              !player.setAbility({ ability: 'citadel_ability_hook', cooldownEnd: now + 3 })) {
            // An item can arrive a frame after the pawn respawns.
            return
          }
        }
        this.phase = 'countdown'
        this.deadline = now + 3
      }
    }
    if (this.phase === 'countdown' && now >= this.deadline) {
      this.phase = 'live'
    }
  }

  forgetHud(player: Player): void {
    this.lastHud.delete(player)
  }

  draw(viewers: { player: Player; name: string; bot: boolean; ready: boolean }[], seats: (Player | undefined)[], scores: number[], now: number): void {
    const names = seats.map((p, i) => viewers.find((v) => v.player === p)?.name || `P${i + 1}: waiting`)
    const line = this.phase === 'waiting' ? seats.map((p, i) => `${names[i]}: ${!p ? 'EMPTY' : this.isReady(p) ? 'READY' : 'NOT READY'}`).join('\n')
      : this.phase === 'prepare' ? 'Preparing arena'
      : this.phase === 'countdown' ? `START IN ${Math.max(1, Math.ceil(this.deadline - now))}`
      : this.phase === 'live' ? 'HOOK!'
      : this.result
    const key = JSON.stringify([names, scores, this.number, line, this.phase])
    const text = `HOOK ARENA   |   ROUND ${this.number}\nP1   ${scores[0]} : ${scores[1]}   P2\n${line}`
    if (this.hudText !== undefined && (text !== this.displayedText || now >= this.nextDisplay)) {
      const firstDisplay = this.displayedText === ''
      const sent = fireInput(this.hudText, 'SetText', { text }) && fireInput(this.hudText, 'Display')
      if (firstDisplay) console.log('[Hook Arena] Map HUD display accepted:', sent)
      this.displayedText = text
      this.nextDisplay = now + 2
    }
    const connected = new Set(viewers.map((v) => v.player))
    for (const p of this.lastHud.keys()) if (!connected.has(p)) this.lastHud.delete(p)
    for (const viewer of viewers) {
      if (viewer.bot || !viewer.ready) {
        this.forgetHud(viewer.player)
        continue
      }
      if (this.lastHud.get(viewer.player) === key) continue
      const firstDraw = !this.lastHud.has(viewer.player)
      if (firstDraw) hide(viewer.player) // Clear the SDK's slot cache before the first full redraw.
      const ui = [TopStrip({ heading: `HOOK ARENA | ROUND ${this.number} | FIRST TO 10`,
        keepTeamBar: false, line: `${names[0]}  vs  ${names[1]}`,
        children: Score({ points: [scores[0], scores[1]] }) })]
      if (this.phase === 'countdown' || this.phase === 'prepare') {
        ui.push(countdown(this.number,
          this.phase === 'countdown' ? Math.max(1, Math.ceil(this.deadline - now)) : undefined, this.phrase))
      }
      if (this.phase === 'break' || this.phase === 'finished' || this.phase === 'error' || this.phase === 'waiting') {
        const title = this.phase === 'waiting' ? 'READY CHECK' : this.phase === 'error' ? 'ARENA SETUP' : this.result
        const detail = this.phase === 'finished' ? 'Next duel: /hookjoin 1 or /hookjoin 2'
          : this.phase === 'break' ? `Next: round ${this.number + 1}` : line + (this.phase === 'waiting' ? '\nChat: /hookjoin 1 or /hookjoin 2\nConsole: cmd hookjoin 1 or cmd hookjoin 2' : '')
        ui.push(jsx('panel', {
          children: [jsx('label', { children: title, style: { width: '100%', fontSize: 24, face: 'body', bold: true, color: '#f5c775', textOverflow: 'shrink' } }),
            jsx('label', { children: detail, style: { width: '100%', fontSize: 18, face: 'body', color: '#eee8db', margin: [10, 0, 0, 0] } })],
          style: { horizontalAlign: 'right', verticalAlign: 'bottom', margin: [0, 28, 32, 0],
            width: 360, flow: 'down', padding: 20, background: '#101820ee',
            borderRadius: 12 },
        }))
      }
      const hidden = hideHud(viewer.player, ['topBar', 'ownHealth', 'minimap', 'ammo'])
      if (show(viewer.player, ui) && hidden) {
        this.lastHud.set(viewer.player, key)
        if (firstDraw) console.log('[Hook Arena] Full HUD accepted for slot', viewer.player.slot)
      }
    }
  }
}
