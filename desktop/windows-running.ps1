param([Parameter(Mandatory = $true)] [string] $AppId)
$ErrorActionPreference = 'Stop'
if ($AppId -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') { throw 'Invalid application identity.' }
$appDir = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) "WebAppMaker\apps\$AppId"
$metadata = Get-Content -LiteralPath (Join-Path $appDir 'pake-runtime\app.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$name = if ($metadata.executableName) { [string] $metadata.executableName } else { 'WebApp.exe' }
if ($name -notmatch '^[a-zA-Z0-9_][a-zA-Z0-9 _.-]{0,59}\.exe$' -or $name -match '[ .]\.exe$' -or $name -match '^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)') { throw 'Invalid executable name.' }
$executable = Join-Path $appDir $name
$processes = @(Get-CimInstance Win32_Process -Filter "Name = '$name'")
if (@($processes | Where-Object { -not $_.ExecutablePath }).Count -gt 0) { throw 'Cannot verify all application processes.' }
if (@($processes | Where-Object { $_.ExecutablePath -eq $executable }).Count -gt 0) { exit 10 }
