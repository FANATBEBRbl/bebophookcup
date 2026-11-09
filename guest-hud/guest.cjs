const fs = require('node:fs')
const http = require('node:http')
const { spawn, spawnSync } = require('node:child_process')
const path = require('node:path')
const readline = require('node:readline/promises')

async function main() {
  const prompt = readline.createInterface({input: process.stdin, output: process.stdout})
  let host
  try {
    let dir = process.argv[2] || path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam', 'steamapps', 'common', 'Deadlock', 'game', 'citadel')
    if (!fs.existsSync(path.join(dir, 'gameinfo.gi'))) {
      dir = (await prompt.question('Path to Deadlock/game/citadel: ')).trim().replace(/^"|"$/g, '')
    }
    const config = path.join(dir, 'gameinfo.gi')
    const original = fs.readFileSync(config, 'latin1')
    const marker = '// BEBOP GUEST HUD BEGIN'
    const mount = 'Game citadel/bebop_guest_hud'
    const paths = /^\s*"?SearchPaths"?\s*\{[^\r\n]*\r?\n/im.exec(original)
    if (!paths) throw Error('SearchPaths missing from gameinfo.gi')
    if (original.includes(marker) && !original.includes(mount)) throw Error('Incomplete guest HUD mount')
    const target = path.join(dir, 'bebop_guest_hud')
    fs.mkdirSync(path.join(target, 'maps'), {recursive:true})
    for (const [file, dest] of [['pak01_dir.vpk', target], ['bebop_arena_small.vpk', path.join(target, 'maps')]]) {
      fs.copyFileSync(path.join(__dirname, file), path.join(dest, file))
    }
    if (!original.includes(marker)) {
      const offset = paths.index + paths[0].length
      const block = [marker, 'Mod citadel', 'Write citadel', mount, '// BEBOP GUEST HUD END', ''].join('\r\n')
      fs.copyFileSync(config, config + '.bebop-' + Date.now() + '.bak', fs.constants.COPYFILE_EXCL)
      const tmp = config + '.' + process.pid + '.tmp'
      fs.writeFileSync(tmp, original.slice(0, offset) + block + original.slice(offset), {encoding:'latin1', flag:'wx'})
      fs.renameSync(tmp, config)
    }
    if (process.argv[3] === '--install-only') return
    host = '138.16.184.175'
  } finally { prompt.close() }
  // Steam's active account, not a name or server slot that changes on reconnect.
  const active = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '(Get-ItemProperty HKCU:\\Software\\Valve\\Steam\\ActiveProcess).ActiveUser'],
    { encoding: 'utf8', windowsHide: true })
  const account = active.stdout?.trim()
  if (!/^[1-9][0-9]*$/.test(account || '') || BigInt(account) > 0xffffffffn)
    throw Error('Sign in to Steam, then restart this launcher.')
  const steamid = String(76561197960265728n + BigInt(account))
  console.log('HUD account: ' + steamid)
  let status = ''
  const report = text => { if (status !== text) { status = text; console.log(text) } }
  const relay = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://hyperline.gg')
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
    if (req.method !== 'GET' || !['/panorama/stream', '/panorama/stream?encoding=binary'].includes(req.url)) {
      res.writeHead(404).end(); return
    }
    const upstream = http.get({ hostname: host, port: 4321,
      path: '/panorama/stream?steamid=' + steamid, agent: false }, stream => {
      clearTimeout(connectTimer)
      report(stream.statusCode === 200 ? 'HUD connected.' : 'HUD unavailable (HTTP ' + stream.statusCode + '). Check that the server HUD was updated.')
      res.writeHead(stream.statusCode, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
      res.flushHeaders()
      stream.on('error', () => res.destroy())
      stream.pipe(res)
    })
    const connectTimer = setTimeout(() => upstream.destroy(Error('HUD connection timeout')), 5000)
    upstream.setTimeout(10000, () => upstream.destroy(Error('HUD heartbeat timeout')))
    upstream.on('error', () => {
      report('HUD reconnecting...')
      clearTimeout(connectTimer)
      if (res.headersSent) res.destroy()
      else res.writeHead(503).end('HUD reconnecting')
    })
    res.on('close', () => { clearTimeout(connectTimer); upstream.destroy() })
  })
  relay.on('error', err => { console.error(err.message); process.exitCode = 1 })
  relay.listen(4320, '127.0.0.1', () => {
    console.log('HUD ready. Keep this window open.')
    if (!process.argv.includes('--launch')) return
    const launcher = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "Start-Process 'steam://run/1422450//+connect%20138.16.184.175:27067/'"],
      { windowsHide: true, stdio: 'inherit' })
    launcher.on('error', err => console.error('Steam launch failed:', err.message))
    launcher.on('exit', code => {
      if (code !== 0) console.error('Steam launch failed. Start Deadlock and connect to 138.16.184.175:27067 manually.')
    })
  })
}
main().catch(err => { console.error(err.message); process.exitCode = 1 })
