param([switch]$FullInstall)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
trap {
    foreach ($process in @($cancelTest,$fullTest)) {
        if ($process -and -not $process.HasExited) { Start-Sleep -Milliseconds 500; $process.CloseMainWindow() | Out-Null }
    }
    throw
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$testRoot = Join-Path $projectRoot ('.cache/installer-tests/' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$clone = Join-Path $testRoot '克隆项目 with spaces'
New-Item -ItemType Directory -Path $clone -Force | Out-Null
foreach ($file in @('install.exe','package.json','package-lock.json','LICENSE','ASSET_NOTICE.md')) { Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $clone $file) }
foreach ($dir in @('src','scripts')) { Copy-Item -LiteralPath (Join-Path $projectRoot $dir) -Destination (Join-Path $clone $dir) -Recurse }
New-Item -ItemType Directory -Path (Join-Path $clone 'assets') -Force | Out-Null
foreach ($file in @('gpt.ico','claude.ico','deepseek.ico')) { Copy-Item -LiteralPath (Join-Path $projectRoot ('assets/' + $file)) -Destination (Join-Path $clone ('assets/' + $file)) }
function Find-Window([int]$ProcessId) {
    $condition = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ProcessIdProperty,$ProcessId)
    return [Windows.Automation.AutomationElement]::RootElement.FindFirst([Windows.Automation.TreeScope]::Children,$condition)
}
function Find-Button($Window,[string]$Name) {
    $condition = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::NameProperty,$Name)
    return $Window.FindFirst([Windows.Automation.TreeScope]::Descendants,$condition)
}
function Click-Button($Button) {
    if (-not $Button) { throw 'Installer button missing.' }
    $Button.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
}
function Wait-Window($Process) {
    for ($i=0;$i -lt 40;$i++) {
        $window=Find-Window $Process.Id
        if ($window) {
            $button=Find-Button $window '同意并安装'
            if ($button) { try { $null=$button.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern); return $window } catch {} }
        }
        Start-Sleep -Milliseconds 250
    }
    throw 'Installer window did not appear.'
}
$exe = Join-Path $clone 'install.exe'
$cancelTest = Start-Process -FilePath $exe -WindowStyle Normal -PassThru
$window = Wait-Window $cancelTest
if (-not (Find-Button $window '同意并安装')) { throw 'Explicit consent button missing.' }
$edits = $window.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
$content = ''
foreach ($edit in $edits) {
    $content += $edit.Current.Name
    try { $content += $edit.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern).Current.Value } catch {}
    try { $content += $edit.GetCurrentPattern([Windows.Automation.TextPattern]::Pattern).DocumentRange.GetText(-1) } catch {}
}
foreach ($word in @('Node.js','Electron','GPT','Claude','DeepSeek','三个桌面快捷方式','取消')) { if (-not $content.Contains($word)) { throw ('Consent explanation missing: ' + $word) } }
if (Test-Path -LiteralPath (Join-Path $clone '.cache')) { throw 'Installer wrote files before consent.' }
Click-Button (Find-Button $window '取消')
if (-not $cancelTest.WaitForExit(5000)) { throw 'Cancellation did not exit.' }
if (Test-Path -LiteralPath (Join-Path $clone '.cache')) { throw 'Cancellation caused installation writes.' }
Write-Output 'PASS: GUI explains all downloads and three shortcuts; cancelling creates no files or downloads.'
# Direct invocation must also reject absence of explicit consent before mutation.
$ErrorActionPreference = 'Continue'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $clone 'scripts/windows/install.ps1') -ProjectRoot $clone 2>$null
$ErrorActionPreference = 'Stop'
if ($LASTEXITCODE -eq 0 -or (Test-Path -LiteralPath (Join-Path $clone '.cache'))) { throw 'Consent guard failed.' }
Write-Output 'PASS: installation engine refuses unconfirmed invocation.'
if (-not $FullInstall) { exit 0 }
foreach ($dir in @('v3','v4','v5','v6','v7')) { Copy-Item -LiteralPath (Join-Path $projectRoot ('assets/' + $dir)) -Destination (Join-Path $clone ('assets/' + $dir)) -Recurse }
foreach ($file in @('gpt-icon.png','claude-icon.png','deepseek-icon.png')) { Copy-Item -LiteralPath (Join-Path $projectRoot ('assets/' + $file)) -Destination (Join-Path $clone ('assets/' + $file)) }
$desktop = Join-Path $clone '.cache/test-desktop'
$fullTest = Start-Process -FilePath $exe -ArgumentList @('--desktop',('"' + $desktop + '"'),'--portable-node') -WindowStyle Normal -PassThru
$window = Wait-Window $fullTest
Click-Button (Find-Button $window '同意并安装')
$statusPath = Join-Path $clone '.cache/install/status.json'
$lastMessage = ''
$deadline = (Get-Date).AddMinutes(20)
while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $statusPath) {
        try {
            $state = Get-Content -LiteralPath $statusPath -Encoding utf8 -Raw | ConvertFrom-Json
            if ($state.message -ne $lastMessage) { Write-Output $state.message; $lastMessage=$state.message }
            if ($state.message.StartsWith('安装失败')) { throw $state.message }
            if ($state.percent -eq 100) { break }
        } catch [ArgumentException] {}
    }
    Start-Sleep -Milliseconds 500
}
if (-not $state -or $state.percent -ne 100) { throw 'Fresh clone installation failed or timed out. See its .cache/install/install.log.' }
for ($i=0;$i -lt 30;$i++) { $done=Find-Button (Find-Window $fullTest.Id) '完成'; if ($done -and $done.Current.IsEnabled) { break }; Start-Sleep -Milliseconds 200 }
Click-Button $done
if (-not $fullTest.WaitForExit(5000) -or $fullTest.ExitCode -ne 0) { throw 'Installer completion failed.' }
$shellObject = New-Object -ComObject WScript.Shell
$liveExe = Join-Path $clone 'dist/Deskbot-win32-x64/Deskbot.exe'
if (-not (Test-Path -LiteralPath $liveExe)) { throw 'Installed application missing.' }
if (@(Get-ChildItem -LiteralPath $desktop -Filter '*.lnk').Count -ne 3) { throw 'Expected exactly three shortcuts.' }
foreach ($name in @('GPT','Claude','DeepSeek')) {
    $shortcut = $shellObject.CreateShortcut((Join-Path $desktop ($name + '.lnk')))
    if ($shortcut.TargetPath -ne $liveExe -or $shortcut.Arguments -ne ('--pet=' + $name.ToLowerInvariant())) { throw 'Shortcut target/arguments incorrect.' }
}
Write-Output 'PASS: confirmed GUI installs a fresh clone using portable Node, npm dependencies and Electron; creates exactly three correct shortcuts in isolated test desktop.'
Write-Output ('Test checkout: ' + $clone)
