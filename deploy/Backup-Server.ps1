param(
  [string]$Base = 'C:\BebopServer',
  [string]$Destination = ('C:\BebopBackup-' + (Get-Date -Format 'yyyyMMdd-HHmmss')),
  [string]$Game = 'C:\Program Files (x86)\Steam\steamapps\common\Deadlock',
  [switch]$IncludeGame
)
$ErrorActionPreference = 'Stop'
$Repo = Split-Path $PSScriptRoot -Parent
if (Test-Path -LiteralPath $Destination) { throw 'Destination must be a new directory.' }
New-Item -ItemType Directory -Path $Destination | Out-Null
function Copy-Tree($Source, $Target) {
  if (Test-Path -LiteralPath $Source) {
    & robocopy $Source $Target /E /COPY:DAT /R:1 /W:1 /XJ /NFL /NDL /NJH /NJS
    if ($LASTEXITCODE -ge 8) { throw "Copy failed: $Source" }
  } else { Write-Warning "Not found: $Source" }
}
& git -C $Repo bundle create (Join-Path $Destination 'bebop.bundle') --all
if ($LASTEXITCODE) { throw 'Git bundle failed' }
& git -C $Repo rev-parse HEAD | Set-Content (Join-Path $Destination 'commit.txt')
& git -C $Repo status --porcelain | Set-Content (Join-Path $Destination 'working-tree-status.txt')
Copy-Tree (Join-Path $Base 'logs') (Join-Path $Destination 'logs')
Copy-Tree (Join-Path $Base 'dumps') (Join-Path $Destination 'dumps')
if (!(Test-Path -LiteralPath "$env:LOCALAPPDATA\modlock\host\v0.1.73\modlock-host.exe")) { throw "Pinned host 0.1.73 missing in this Windows profile. Locate the actual host before archiving." }
Copy-Tree "$env:LOCALAPPDATA\modlock\host\v0.1.73" (Join-Path $Destination 'host-v0.1.73')
$Cli = Join-Path $Base 'modlock.exe'
if (!(Test-Path -LiteralPath $Cli)) { throw "Missing CLI: $Cli" }
Copy-Item -LiteralPath $Cli -Destination (Join-Path $Destination 'modlock.exe')
$Node = (Get-Command node.exe -ErrorAction Stop).Source
Copy-Item -LiteralPath $Node -Destination (Join-Path $Destination 'node.exe')
if ($IncludeGame) { Copy-Tree $Game (Join-Path $Destination 'Deadlock') }
# Spawns are intentionally excluded at the owner's request.
Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber | ConvertTo-Json | Set-Content (Join-Path $Destination 'windows.json')
& $Cli --version 2>&1 | Out-File (Join-Path $Destination 'modlock-version.txt')
& $Node --version | Set-Content (Join-Path $Destination 'node-version.txt')
Get-ChildItem -LiteralPath $Destination -File -Recurse | ForEach-Object {
  [pscustomobject]@{Path=$_.FullName.Substring($Destination.Length + 1); SHA256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash; Bytes=$_.Length}
} | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $Destination 'manifest.json')
Write-Host "Backup ready: $Destination. Download the WHOLE folder before deleting the VPS."
