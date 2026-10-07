param([string]$DesktopPath = [Environment]::GetFolderPath('Desktop'))
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$exePath = Join-Path $projectRoot 'dist\Deskbot-win32-x64\Deskbot.exe'
if (-not (Test-Path -LiteralPath $exePath)) { throw '请先运行 npm run package 打包程序。' }
$shellObject = New-Object -ComObject WScript.Shell
# Same file names as the existing desktop shortcuts, so re-running after moving the folder updates them in place.
$pets = @(@{Id='gpt';Name='GPT'},@{Id='claude';Name='Claude'},@{Id='deepseek';Name='DeepSeek'})
foreach ($pet in $pets) {
  $linkPath = Join-Path $DesktopPath ($pet.Name + '.lnk')
  $shortcut = $shellObject.CreateShortcut($linkPath)
  $shortcut.TargetPath = $exePath
  $shortcut.Arguments = '--pet=' + $pet.Id
  $shortcut.WorkingDirectory = Split-Path -Parent $exePath
  $shortcut.IconLocation = (Join-Path $projectRoot ('assets\' + $pet.Id + '.ico')) + ',0'
  $shortcut.Description = 'Deskbot - ' + $pet.Name
  $shortcut.Save()
  Write-Output $linkPath
}
