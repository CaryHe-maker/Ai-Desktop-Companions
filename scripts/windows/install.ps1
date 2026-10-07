param(
    [string]$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..')),
    [switch]$ConsentGranted,
    [string]$DesktopPath = [Environment]::GetFolderPath('Desktop'),
    [switch]$UsePortableNode
)
$ErrorActionPreference = 'Stop'
# This check must precede all directory creation, downloads and shortcut writes.
if (-not $ConsentGranted) { throw 'Installation requires explicit consent in install.exe.' }
$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
if (-not [Environment]::Is64BitOperatingSystem) { throw '64-bit Windows is required.' }
foreach ($file in @('package.json','package-lock.json','src/main.cjs','scripts/build/package.cjs')) {
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot $file))) { throw 'Incomplete project checkout.' }
}
$installDir = Join-Path $ProjectRoot '.cache/install'
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$statusFile = Join-Path $installDir 'status.json'
$logFile = Join-Path $installDir 'install.log'
$utf8 = New-Object Text.UTF8Encoding($false)
$lock = $null
function Assert-InProject([string]$Target) {
    $full = [IO.Path]::GetFullPath($Target)
    if (-not $full.StartsWith($ProjectRoot + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Installer path outside project.' }
    return $full
}
function Set-Progress([int]$Percent,[string]$Message) {
    $state = @{percent=$Percent;message=$Message} | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($statusFile + '.tmp',$state,$utf8)
    [IO.File]::Copy($statusFile + '.tmp',$statusFile,$true)
    [IO.File]::Delete($statusFile + '.tmp')
    [IO.File]::AppendAllText($logFile, ('[' + (Get-Date -Format 'HH:mm:ss') + '] ' + $Message + [Environment]::NewLine),$utf8)
}
function Test-Node([string]$Executable) {
    if (-not $Executable -or -not (Test-Path -LiteralPath $Executable)) { return $false }
    try {
        $raw = (& $Executable --version 2>$null | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $raw -notmatch '^v(\d+)\.(\d+)\.(\d+)$') { return $false }
        $version = [version]($raw.Substring(1))
        $architecture = (& $Executable -p 'process.arch' 2>$null | Out-String).Trim()
        return $version -ge [version]'22.12.0' -and $architecture -eq 'x64'
    } catch { return $false }
}
function Get-PortableNode {
    $nodeDir = Assert-InProject (Join-Path $ProjectRoot '.cache/tools/node')
    $node = Join-Path $nodeDir 'node.exe'
    if ((Test-Node $node) -and (Test-Path -LiteralPath (Join-Path $nodeDir 'node_modules/npm/bin/npm-cli.js'))) { return $node }
    Set-Progress 8 '正在从 nodejs.org 下载 Node.js 24 LTS 便携版…'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' -TimeoutSec 120).Content
    $match = [regex]::Match($checksums,'(?m)^([a-fA-F0-9]{64})\s+(node-(v24\.\d+\.\d+)-win-x64\.zip)\s*$')
    if (-not $match.Success) { throw 'Could not identify the official Node.js 24 x64 download.' }
    $archiveName = $match.Groups[2].Value
    $archive = Join-Path $installDir 'node-download.zip'
    $url = 'https://nodejs.org/dist/' + $match.Groups[3].Value + '/' + $archiveName
    if (-not (Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $match.Groups[1].Value) {
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive -TimeoutSec 240
    }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $match.Groups[1].Value) { throw 'Node.js download checksum mismatch. Installation stopped.' }
    Set-Progress 18 'Node.js 下载校验通过，正在解压…'
    $unpack = Assert-InProject (Join-Path $installDir ('node-unpack-' + [Guid]::NewGuid().ToString('N')))
    New-Item -ItemType Directory -Path $unpack -Force | Out-Null
    $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
    if ($tar) { Invoke-InstallCommand $tar.Source @('-xf',$archive,'-C',$unpack) }
    else { Expand-Archive -LiteralPath $archive -DestinationPath $unpack }
    $source = Assert-InProject (Join-Path $unpack ($archiveName.Substring(0,$archiveName.Length-4)))
    if (-not (Test-Node (Join-Path $source 'node.exe'))) { throw 'Downloaded Node.js could not start.' }
    New-Item -ItemType Directory -Force -Path (Split-Path $nodeDir) | Out-Null
    if (Test-Path -LiteralPath $nodeDir) {
        $old = Assert-InProject (Join-Path $installDir ('node-backup-' + [Guid]::NewGuid().ToString('N')))
        Move-Item -LiteralPath $nodeDir -Destination $old
    }
    Move-Item -LiteralPath $source -Destination $nodeDir
    # The verified archive and extracted parent remain cached for retries.
    return $node
}
function Invoke-InstallCommand([string]$Executable,[string[]]$Arguments) {
    $savedPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $Executable @Arguments 2>&1 | ForEach-Object {
            $line = if ($_ -is [Management.Automation.ErrorRecord]) { $_.Exception.Message } else { $_.ToString() }
            [IO.File]::AppendAllText($logFile,($line + [Environment]::NewLine),$utf8)
        }
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $savedPreference }
    if ($code -ne 0) { throw ('Dependency/build command failed (exit ' + $code + '). See install.log.') }
}
try {
    $lock = [IO.File]::Open((Join-Path $installDir 'install.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    [IO.File]::WriteAllText($logFile,'',$utf8)
    Set-Progress 3 '正在检查 Node.js 与项目文件…'
    $node = $null
    if (-not $UsePortableNode) {
        $found = Get-Command node.exe -ErrorAction SilentlyContinue
        if ($found -and (Test-Node $found.Source)) {
            $npmCandidate = Join-Path (Split-Path $found.Source) 'node_modules/npm/bin/npm-cli.js'
            if (Test-Path -LiteralPath $npmCandidate) { $node = $found.Source }
        }
    }
    if (-not $node) { $node = Get-PortableNode }
    $npm = Join-Path (Split-Path $node) 'node_modules/npm/bin/npm-cli.js'
    $env:PATH = (Split-Path $node) + ';' + $env:PATH
    $env:npm_config_cache = Join-Path $ProjectRoot '.cache/npm'
    $env:ELECTRON_INSTALL_ARCH = 'x64'
    $env:ELECTRON_CACHE = Join-Path $ProjectRoot '.cache/electron'
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    Push-Location -LiteralPath $ProjectRoot
    try {
        Set-Progress 25 '正在安装锁定的 npm 依赖和 Electron；首次下载可能需要几分钟…'
        Invoke-InstallCommand $node @($npm,'ci','--include=dev','--ignore-scripts=false','--no-audit','--no-fund')
        Set-Progress 65 '正在打包三位桌面小伙伴…'
        Invoke-InstallCommand $node @($npm,'run','package')
        $liveExe = Assert-InProject (Join-Path $ProjectRoot 'dist/Deskbot-win32-x64/Deskbot.exe')
        $running = @(Get-Process Deskbot -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $liveExe })
        if ($running.Count) {
            Set-Progress 80 '正在请求旧版正常退出；用户数据将保留…'
            Start-Process -FilePath $liveExe -ArgumentList '--quit-for-update' -WindowStyle Hidden -Wait
            for ($i=0;$i -lt 40;$i++) {
                $running = @(Get-Process Deskbot -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $liveExe })
                if (-not $running.Count) { break }; Start-Sleep -Milliseconds 250
            }
            if ($running.Count) { throw '请从托盘退出正在运行的 Deskbot，再重新安装。' }
        }
        Set-Progress 85 '正在激活程序，迁移已有数据并备份旧版本…'
        & (Join-Path $PSScriptRoot 'activate-build.ps1') | ForEach-Object { [IO.File]::AppendAllText($logFile,($_ + [Environment]::NewLine),$utf8) }
        Set-Progress 95 '正在生成 GPT、Claude、DeepSeek 三个桌面快捷方式…'
        & (Join-Path $PSScriptRoot 'install-shortcuts.ps1') -DesktopPath $DesktopPath | ForEach-Object { [IO.File]::AppendAllText($logFile,($_ + [Environment]::NewLine),$utf8) }
        Set-Progress 100 '安装完成：三个桌面快捷方式已生成，双击即可启动。'
    } finally { Pop-Location }
} catch {
    if ($lock) {
        [IO.File]::AppendAllText($logFile,($_.ScriptStackTrace + [Environment]::NewLine),$utf8)
        Set-Progress 0 ('安装失败：' + $_.Exception.Message)
    }
    exit 1
} finally { if ($lock) { $lock.Dispose() } }
exit 0
