param([Parameter(Mandatory=$true)][string]$Runtime, [string]$Output)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
if (!$Output) { $Output=Join-Path $repo 'distributions\Bebop-Player.zip' }
foreach ($file in @('node.exe','LICENSE.txt')) {
  if (!(Test-Path -LiteralPath (Join-Path $Runtime $file))) { throw "Runtime missing $file" }
}
$stage=Join-Path ([IO.Path]::GetTempPath()) ('bebop-kit-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path (Join-Path $stage 'runtime') -Force | Out-Null
foreach ($file in @('Start HUD.cmd','guest.cjs','server.txt','README.txt','pak01_dir.vpk')) {
  Copy-Item -LiteralPath (Join-Path $repo "guest-hud\$file") -Destination $stage
}
Copy-Item -LiteralPath (Join-Path $repo 'maps\bebop_arena_small.vpk') -Destination $stage
Copy-Item -LiteralPath (Join-Path $Runtime 'node.exe'),(Join-Path $Runtime 'LICENSE.txt') -Destination (Join-Path $stage 'runtime')
New-Item -ItemType Directory -Force -Path (Split-Path $Output -Parent) | Out-Null
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $Output -Force
Write-Host "Created $Output; staging retained at $stage"
