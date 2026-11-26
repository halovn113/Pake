$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) { throw 'The .NET Framework C# compiler is unavailable.' }
$outputDir = Join-Path $PSScriptRoot 'bin.local'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$output = Join-Path $outputDir 'WebAppMaker.Uninstaller.exe'
& $compiler /nologo /target:winexe /platform:anycpu /codepage:65001 /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/out:$output" (Join-Path $PSScriptRoot 'Uninstaller.cs')
if ($LASTEXITCODE -ne 0) { throw "Uninstaller compilation failed ($LASTEXITCODE)." }
Write-Output $output
