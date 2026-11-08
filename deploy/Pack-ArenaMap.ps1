# Run after building bebop_arena_small in Hammer on the map author's PC.
param(
    [string]$Addon = 'C:\Dev\tools\downloads\Reduced_CSDK_13\game\citadel_addons\bebop_arena',
    [string]$Cli = 'C:\Dev\bebop-hook-arena\node_modules\.bin\modlock.cmd'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$name = 'bebop_arena_small.vpk'
$stage = Join-Path $env:TEMP ('bebop-pack-' + [guid]::NewGuid())
$tree = Join-Path $stage 'contents'
$out = Join-Path $stage $name
& $Cli vpk unpack (Join-Path "$Addon\maps" $name) $tree
if ($LASTEXITCODE) { throw 'Cannot unpack Hammer build' }
Copy-Item -LiteralPath "$Addon\materials" -Destination $tree -Recurse -Force
& $Cli vpk pack $tree $out
if ($LASTEXITCODE) { throw 'Map packing failed' }
$entries = & $Cli vpk list $out
if ($LASTEXITCODE -or !($entries -match 'materials/signs/bebop_hook_arena\.vmat_c') -or !($entries -match 'materials/signs/bebop_hook_arena_png_.*\.vtex_c')) { throw 'Missing poster resources' }
Copy-Item -LiteralPath $out -Destination (Join-Path "$repo\maps" $name)
