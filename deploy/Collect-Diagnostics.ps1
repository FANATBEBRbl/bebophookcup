param([string]$Base='C:\BebopServer', [string]$Destination=('C:\BebopDiagnostics-' + (Get-Date -Format 'yyyyMMdd-HHmmss')))
$ErrorActionPreference='Stop'
if (Test-Path -LiteralPath $Destination) { throw 'Destination must be new' }
New-Item -ItemType Directory -Path $Destination | Out-Null
foreach ($name in @('logs','dumps')) {
  $source=Join-Path $Base $name
  if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $Destination -Recurse }
}
$since=(Get-Date).AddDays(-7)
Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=$since; Id=1000,1001} -ErrorAction SilentlyContinue |
  Select-Object TimeCreated,Id,ProviderName,Message | Export-Clixml (Join-Path $Destination 'application-events.xml')
Get-CimInstance Win32_Process | Where-Object Name -Match 'modlock|node|deadlock' |
  Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json | Set-Content (Join-Path $Destination 'processes.json')
Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber | ConvertTo-Json | Set-Content (Join-Path $Destination 'windows.json')
$active=Join-Path $Base 'releases\active.txt'
if (Test-Path -LiteralPath $active) { Copy-Item -LiteralPath $active -Destination $Destination }
Write-Host "Saved: $Destination. Dumps may contain private memory; do not put this folder in Git."
