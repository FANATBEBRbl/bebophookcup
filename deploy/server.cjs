// Launch on the VPS from a clone with read access to origin/dev.
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')
const { createInterface } = require('node:readline')
const { HudFeed } = require('./hud-feed.cjs')
const hud = new HudFeed()
const { createJournal } = require('./journal.cjs')

const repo = path.resolve(__dirname, '..')
const base = process.env.BEBOP_SERVER || 'C:\\BebopServer'
const cli = path.join(base, 'modlock.exe')
const game = process.env.DEADLOCK_DIR || path.join(process.env['ProgramFiles(x86)'], 'Steam', 'steamapps', 'common', 'Deadlock')
const map = 'bebop_arena_small.vpk'
const state = path.join(base, 'releases')
const checkpoint = path.join(state, 'active.txt')
const journal = createJournal(path.join(base, 'logs'))
for (const level of ['log', 'error']) {
  const original = console[level].bind(console)
  console[level] = (...args) => { journal(level, args.map(String).join(' ')); original(...args) }
}
const pinned = process.env.BEBOP_REF
journal('updater-start', { node: process.version, repo, game, pinned: pinned || 'origin/dev' })
let running
let closing = false

function run(exe, args, cwd = repo) {
  const p = spawnSync(exe, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 180000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  if (p.error || p.status !== 0) throw Error(p.error?.message || p.stderr || p.stdout || exe)
  return p.stdout.trim()
}

function stop() {
  if (running && running.exitCode === null && running.pid) {
    spawnSync('taskkill', ['/PID', String(running.pid), '/T', '/F'], { windowsHide: true })
  }
  running = undefined
  hud.reset()
}

function prepare(id) {
  const dir = path.join(state, id)
  if (!fs.existsSync(dir)) run('git', ['worktree', 'add', '--detach', dir, id])
  if (run('git', ['rev-parse', 'HEAD'], dir) !== id) throw Error('Unexpected release checkout')
  run(cli, ['build', dir], dir)
  const vpk = fs.readFileSync(path.join(dir, 'build', 'maps', map))
  if (vpk.readUInt32LE(0) !== 0x55aa1234) throw Error('Missing or invalid compiled map')
}

async function launch(id) {
  const dir = path.join(state, id, 'build')
  const dest = path.join(game, 'game', 'citadel', 'maps')
  fs.mkdirSync(dest, { recursive: true })
  const temp = path.join(dest, map + '.deploy.tmp')
  fs.copyFileSync(path.join(dir, 'maps', map), temp)
  fs.renameSync(temp, path.join(dest, map))
  const p = spawn(cli, ['--json', 'play', '--no-game', '--ui-port=0', '--watch=false', dir], {
    cwd: base, env: { ...process.env, DEADLOCK_DIR: game }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
  })
  running = p
  journal('launch', { commit: id, pid: p.pid })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Arena readiness timeout')), 90000)
    let tail = ''
    function output(chunk) {
      journal('host', String(chunk))
      process.stdout.write(chunk)
      tail = (tail + chunk).slice(-4096)
      if (/server ready on bebop_arena_small/i.test(tail)) { clearTimeout(timer); resolve() }
    }
    createInterface({ input: p.stdout }).on('line', line => {
      try {
        const event = JSON.parse(line)
        hud.handle(event)
        if (event.host?.ready?.map === 'bebop_arena_small') { clearTimeout(timer); resolve() }
        if (!event.host?.ui) output(line + '\n')
      } catch (err) { journal('raw-or-rejected-event', { line, error: err.message }); process.stdout.write(line + '\n') }
    })
    p.stderr.on('data', output)
    p.once('error', err => { clearTimeout(timer); reject(err) })
    p.once('exit', (code, signal) => { journal('process-exit', { commit: id, code, signal, stopping: closing }); if (running === p) hud.reset(); clearTimeout(timer); reject(Error('Modlock exited: ' + code)) })
  })
}

async function main() {
  fs.accessSync(cli)
  fs.accessSync(path.join(game, 'game', 'citadel', 'gameinfo.gi'))
  fs.mkdirSync(state, { recursive: true })
  let active = fs.existsSync(checkpoint) ? fs.readFileSync(checkpoint, 'utf8').trim() : ''
  if (pinned) active = '' // Build the selected release, including after an offline restore.
  let rejected = ''
  while (!closing) {
    try {
      if (active && (!running || running.exitCode !== null)) {
        stop()
        try { await launch(active) } catch (err) { stop(); throw err }
      }
      if (!pinned) run('git', ['fetch', 'origin', '+refs/heads/dev:refs/remotes/origin/dev'])
      const id = run('git', ['rev-parse', '--verify', (pinned || 'refs/remotes/origin/dev') + '^{commit}'])
      if (id !== active && id !== rejected) {
        console.log('Preparing ' + id)
        try {
          prepare(id)
          stop()
          await launch(id)
        } catch (err) {
          rejected = id
          if (active && (!running || running.spawnargs.includes(path.join(state, id, 'build')))) {
            stop(); await launch(active)
          } else if (!active) stop()
          throw err
        }
        active = id
        fs.writeFileSync(checkpoint + '.tmp', id)
        fs.renameSync(checkpoint + '.tmp', checkpoint)
        console.log('Active commit: ' + id)
      }
    } catch (err) { console.error(err.message) }
    if (!closing) await delay(30000)
  }
}
process.once('SIGINT', () => { closing = true; stop(); process.exit(0) })
const lock = net.createServer(socket => socket.end())
lock.once('error', err => { console.error('Cannot start updater:', err.message); process.exitCode = 1 })
lock.listen('\\\\.\\pipe\\bebop-cup-updater', () => {
  const hudServer = hud.serve()
  hudServer.once('error', err => {
    console.error('HUD port 4321 unavailable. Stop the old share.cjs service first:', err.message)
    stop(); process.exit(1)
  })
  hudServer.once('listening', () => {
    main().catch(err => { console.error(err.message); stop(); hudServer.close(); lock.close(); process.exitCode = 1 })
  })
})
