$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$live = [IO.Path]::GetFullPath((Join-Path $workspace 'dist\Deskbot-win32-x64'))
$staged = [IO.Path]::GetFullPath((Join-Path $workspace '.cache\staged\Deskbot-win32-x64'))
$backup = [IO.Path]::GetFullPath((Join-Path $workspace ('.cache\releases\Deskbot-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))))
foreach ($target in @($live,$staged,$backup)) {
    if (-not $target.StartsWith($workspace + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Build path outside workspace' }
}
if (-not (Test-Path -LiteralPath (Join-Path $staged 'Deskbot.exe'))) { throw 'Run npm.cmd run package first.' }
$executable = Join-Path $live 'Deskbot.exe'
$running = @(Get-Process Deskbot -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $executable })
if ($running.Count) { throw 'Close Deskbot using its tray menu before activating this build. Data has not been changed.' }
if (Test-Path -LiteralPath (Join-Path $live 'data')) { Copy-Item -LiteralPath (Join-Path $live 'data') -Destination (Join-Path $staged 'data') -Recurse }
New-Item -ItemType Directory -Force -Path (Split-Path $backup) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $live) | Out-Null
if (Test-Path -LiteralPath $live) { Move-Item -LiteralPath $live -Destination $backup }
try { Move-Item -LiteralPath $staged -Destination $live }
catch { if (Test-Path -LiteralPath $backup) { Move-Item -LiteralPath $backup -Destination $live }; throw }
Write-Output "Activated: $executable"
Write-Output "Previous version: $backup"
