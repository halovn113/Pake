param([Parameter(Mandatory = $true)][string] $AppId, [Parameter(Mandatory = $true)][string] $ExeName)
$ErrorActionPreference = 'Stop'
if ($AppId -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' -or $ExeName -notmatch '^[a-zA-Z0-9_][a-zA-Z0-9 _.-]{0,59}\.exe$') { throw 'Invalid identity or executable name.' }
$appPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) "WebAppMaker\apps\$AppId"
$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\Microsoft\Windows\CurrentVersion\Uninstall\WebAppMaker.$AppId")
try {
    if ($null -ne $key) { [Console]::Out.Write('installed'); exit 0 }
} finally { if ($null -ne $key) { $key.Dispose() } }
if (Test-Path -LiteralPath $appPath) { [Console]::Out.Write('installed'); exit 0 }
$processes = @(Get-CimInstance Win32_Process -Filter "Name = '$ExeName'")
if (@($processes | Where-Object { -not $_.ExecutablePath }).Count -gt 0) { throw 'Cannot verify all application processes.' }
$expected = Join-Path $appPath $ExeName
if (@($processes | Where-Object { $_.ExecutablePath -eq $expected }).Count -gt 0) { [Console]::Out.Write('installed'); exit 0 }
[Console]::Out.Write('removed')
