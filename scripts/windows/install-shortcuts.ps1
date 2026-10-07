param([string]$DesktopPath = [Environment]::GetFolderPath('Desktop'))
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$exePath = Join-Path $projectRoot 'dist\Deskbot-win32-x64\Deskbot.exe'
if (-not (Test-Path -LiteralPath $exePath)) { throw '请先运行 npm run package 打包程序。' }
$shellObject = New-Object -ComObject WScript.Shell
if (-not (Test-Path -LiteralPath $DesktopPath)) { New-Item -ItemType Directory -Path $DesktopPath -Force | Out-Null }
# Same file names as the existing desktop shortcuts, so re-running after moving the folder updates them in place.
$pets = @(@{Id='gpt';Name='GPT'},@{Id='claude';Name='Claude'},@{Id='deepseek';Name='DeepSeek'})
foreach ($pet in $pets) {
  $linkPath = Join-Path $DesktopPath ($pet.Name + '.lnk')
  if (Test-Path -LiteralPath $linkPath) {
    $existing = $shellObject.CreateShortcut($linkPath)
    if ([IO.Path]::GetFileName($existing.TargetPath) -ne 'Deskbot.exe') {
      $linkPath = Join-Path $DesktopPath ($pet.Name + ' - Deskbot.lnk')
      if (Test-Path -LiteralPath $linkPath) {
        $alternate = $shellObject.CreateShortcut($linkPath)
        if ([IO.Path]::GetFileName($alternate.TargetPath) -ne 'Deskbot.exe') { throw 'Desktop shortcut name is occupied by another application.' }
      }
    }
  }
  $shortcut = $shellObject.CreateShortcut($linkPath)
  $shortcut.TargetPath = $exePath
  $shortcut.Arguments = '--pet=' + $pet.Id
  $shortcut.WorkingDirectory = Split-Path -Parent $exePath
  $shortcut.IconLocation = (Join-Path $projectRoot ('assets\' + $pet.Id + '.ico')) + ',0'
  $shortcut.Description = 'Deskbot - ' + $pet.Name
  $shortcut.Save()
  Write-Output $linkPath
}
