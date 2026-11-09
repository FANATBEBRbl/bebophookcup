param([Parameter(Mandatory=$true)][string]$ProcDump, [string]$Base='C:\BebopServer')
$ErrorActionPreference='Stop'
if (!(Test-Path -LiteralPath $ProcDump)) { throw 'Specify the path to procdump64.exe from Microsoft Sysinternals.' }
$folder=Join-Path $Base 'dumps'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
Write-Host 'Watching modlock-host.exe. Stop this watcher with Ctrl+C. Approve the Sysinternals license when prompted.'
while ($true) {
  if (@(Get-ChildItem -LiteralPath $folder -Filter '*.dmp').Count -ge 5) { throw 'Five dumps already exist. Archive them before restarting the watcher.' }
  & $ProcDump -ma -e -w modlock-host.exe $folder
  if ($LASTEXITCODE -ne 0) { throw "ProcDump stopped with code $LASTEXITCODE. Check its output (permissions/EULA/debugger conflict)." }
  Start-Sleep -Seconds 3
}
