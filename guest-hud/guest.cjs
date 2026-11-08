const fs = require('node:fs')
const net = require('node:net')
const { spawn } = require('node:child_process')
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
  const relay = net.createServer(client => {
    const upstream = net.connect(4321, host)
    upstream.on('error', err => { console.error(err.message); client.destroy() })
    client.on('error', () => upstream.destroy())
    client.on('close', () => upstream.destroy())
    upstream.on('close', () => client.destroy())
    client.pipe(upstream).pipe(client)
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
