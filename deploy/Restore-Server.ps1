param(
  [Parameter(Mandatory=$true)][string]$Backup,
  [string]$Base='C:\BebopServer',
  [string]$Game='C:\Program Files (x86)\Steam\steamapps\common\Deadlock'
)
$ErrorActionPreference='Stop'
$Backup=(Resolve-Path -LiteralPath $Backup).Path
if (Test-Path -LiteralPath $Base) { throw 'Choose a new Base directory; existing installations will not be overwritten.' }
$manifest=Get-Content -LiteralPath (Join-Path $Backup 'manifest.json') -Raw | ConvertFrom-Json
foreach ($item in $manifest) {
  $file=Join-Path $Backup $item.Path
  if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $item.SHA256) { throw "Hash mismatch: $file" }
}
New-Item -ItemType Directory -Path $Base | Out-Null
Copy-Item -LiteralPath (Join-Path $Backup 'modlock.exe') -Destination $Base
Copy-Item -LiteralPath (Join-Path $Backup 'node.exe') -Destination $Base
Copy-Item -LiteralPath (Join-Path $Backup 'host-v0.1.73') -Destination $Base -Recurse
$repo=Join-Path $Base 'repo'
& git clone (Join-Path $Backup 'bebop.bundle') $repo
if ($LASTEXITCODE) { throw 'Clone failed; install Git for Windows first.' }
$commit=(Get-Content -LiteralPath (Join-Path $Backup 'commit.txt') -Raw).Trim()
& git -C $repo checkout --detach $commit
if ($LASTEXITCODE) { throw 'Checkout failed' }
& git -C $repo remote set-url origin https://github.com/FANATBEBRbl/bebophookcup
if (!(Test-Path -LiteralPath (Join-Path $Game 'game\citadel\gameinfo.gi'))) {
  Write-Warning 'Before starting, install Deadlock or copy the archived Deadlock folder to the specified Game path.'
}
@"
@echo off
set "BEBOP_SERVER=$Base"
set "DEADLOCK_DIR=$Game"
set "MODLOCK_HOST=$Base\host-v0.1.73\modlock-host.exe"
set "BEBOP_REF=$commit"
"$Base\node.exe" "$repo\deploy\server.cjs"
pause
"@ | Set-Content -LiteralPath (Join-Path $Base 'Start-Restored.cmd') -Encoding ascii
Write-Host "Ready: $Base\Start-Restored.cmd. The server has NOT been started."
