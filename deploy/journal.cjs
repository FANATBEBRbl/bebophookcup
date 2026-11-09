const fs = require('node:fs')
const path = require('node:path')
// Synchronous append keeps the last received event on disk if the host crashes.
// Bounded to eight 16 MiB segments per updater process; no UI payloads are logged.
function createJournal(dir, limit = 16 * 1024 * 1024, count = 8) {
  fs.mkdirSync(dir, {recursive: true})
  const prefix = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid
  let segment = 0, bytes = 0
  return (event, data) => {
    try {
      const line = JSON.stringify({time: new Date().toISOString(), event, data}) + '\n'
      if (bytes + Buffer.byteLength(line) > limit) { segment = (segment + 1) % count; bytes = 0; fs.writeFileSync(path.join(dir, prefix + '-' + segment + '.jsonl'), '') }
      fs.appendFileSync(path.join(dir, prefix + '-' + segment + '.jsonl'), line)
      bytes += Buffer.byteLength(line)
    } catch (err) { process.stderr.write('Cannot save diagnostic log: ' + err.message + '\n') }
  }
}
module.exports = {createJournal}
