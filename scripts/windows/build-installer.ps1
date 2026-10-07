$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$compiler = Join-Path ([Environment]::GetFolderPath('Windows')) 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework C# compiler was not found.' }
$installerPath = Join-Path $projectRoot 'install.exe'
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /utf8output "/out:$installerPath" "/win32icon:$(Join-Path $projectRoot 'assets/gpt.ico')" "/win32manifest:$(Join-Path $projectRoot 'installer/installer.manifest')" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $projectRoot 'installer/Installer.cs')
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
Write-Output 'Built root install.exe from installer/Installer.cs.'
