Vendored dependencies (no npm install on the VPS):
- protobufjs 8.8.1, dist/light/protobuf.min.js, from registry.npmjs.org; BSD-3-Clause (protobuf-LICENSE).
- long 5.3.2, umd/index.js, from registry.npmjs.org; Apache-2.0 (long-LICENSE).
- ui-schema.json: protobufjs parse().root.toJSON() from Modlock src/wasm/ui/ui.proto,
  local source checkout commit 29ae444. Verified against installed Modlock JSON events.

Wire frames follow Modlock panorama/packed.go; full snapshots, per-player slot
binding and generation lifetime follow session/screens.go. All uint64 values
use long.js without conversion to an unsafe JavaScript number.
