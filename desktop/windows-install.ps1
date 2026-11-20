param(
    [Parameter(Mandatory = $true)] [ValidateSet('Install', 'Remove', 'UpgradeUninstaller')] [string] $Action,
    [Parameter(Mandatory = $true)] [string] $AppId,
    [string] $Source,
    [string] $Name,
    [string] $ExeName,
    [string] $UninstallerPath,
    [ValidateSet('vi', 'en')] [string] $Language = 'vi',
    [switch] $SilentError
)

$ErrorActionPreference = 'Stop'
if ($AppId -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') {
    throw 'Invalid application identity.'
}
$appsRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'WebAppMaker\apps'
$appPath = Join-Path $appsRoot $AppId
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\WebAppMaker.$AppId"
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'WebAppMaker'

function Assert-SafeAppDirectory {
    foreach ($dir in @((Split-Path -Parent $appsRoot), $appsRoot, $appPath)) {
        if (Test-Path -LiteralPath $dir) {
            $item = Get-Item -LiteralPath $dir -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Application directory cannot be a link: $dir" }
        }
    }
    $resolved = (Resolve-Path -LiteralPath $appPath).Path
    if ($resolved -ne $appPath -or (Split-Path -Parent $resolved) -ne $appsRoot) { throw 'Application path is not safe to remove.' }
}


function Get-ExecutableName([string] $directory) {
    $metadata = Get-Content -LiteralPath (Join-Path $directory 'pake-runtime\app.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $name = if ($metadata.executableName) { [string] $metadata.executableName } else { 'WebApp.exe' }
    if ($name -notmatch '^[a-zA-Z0-9_][a-zA-Z0-9 _.-]{0,59}\.exe$' -or $name -match '[ .]\.exe$' -or $name -match '^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)') { throw 'Invalid executable name.' }
    return $name
}

function Get-ShortcutPath([string] $appName) {
    # Some Windows hosts cannot create shortcuts with every Unicode code point.
    # Keep the original display name in the registry and use a stable ASCII
    # filename so creation and removal compute the exact same path.
    $normalized = $appName.Normalize([Text.NormalizationForm]::FormD)
    $safeName = ($normalized -replace '\p{Mn}', '' -replace '[^a-zA-Z0-9 _.-]', '_').Trim(' ', '.')
    if (-not $safeName) { $safeName = 'Web App' }
    if ($safeName.Length -gt 60) { $safeName = $safeName.Substring(0, 60).TrimEnd(' ', '.') }
    return Join-Path $startMenu ("$safeName [$($AppId.Substring(0, 8))].lnk")
}

function Set-NativeUninstaller {
    if (-not $UninstallerPath -or -not (Test-Path -LiteralPath $UninstallerPath -PathType Leaf)) { throw 'The graphical uninstaller has not been built.' }
    $digest = [Security.Cryptography.SHA256]::Create()
    try {
        $stream = [IO.File]::OpenRead($UninstallerPath)
        try { $hash = ([BitConverter]::ToString($digest.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() } finally { $stream.Dispose() }
    } finally { $digest.Dispose() }
    $helpers = Join-Path (Split-Path -Parent $appsRoot) 'uninstallers'
    New-Item -ItemType Directory -Path $helpers -Force | Out-Null
    $native = Join-Path $helpers "$hash.exe"
    if (Test-Path -LiteralPath $native) {
        $digest = [Security.Cryptography.SHA256]::Create()
        try {
            $stream = [IO.File]::OpenRead($native)
            try { $existingHash = ([BitConverter]::ToString($digest.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() } finally { $stream.Dispose() }
        } finally { $digest.Dispose() }
        if ($existingHash -ne $hash) { throw 'Uninstaller integrity check failed.' }
    } else { Copy-Item -LiteralPath $UninstallerPath -Destination $native }
    return ('"{0}" {1}' -f $native, $AppId)
}

if ($Action -eq 'UpgradeUninstaller') {
    if (-not (Test-Path -LiteralPath $uninstallKey)) { throw 'Application registration does not exist.' }
    $entry = Get-ItemProperty -LiteralPath $uninstallKey
    if ($entry.InstallLocation -ne $appPath) { throw 'Application location does not match its identity.' }
    Assert-SafeAppDirectory
    if (-not (Test-Path -LiteralPath (Join-Path $appPath 'uninstall.ps1') -PathType Leaf)) { throw 'Application removal helper is missing.' }
    $nativeCommand = Set-NativeUninstaller
    $helperPath = Join-Path $appPath 'uninstall.ps1'
    $nonce = [Guid]::NewGuid().ToString('N')
    $staged = Join-Path $appPath "uninstall-$nonce.tmp"
    $backup = Join-Path $appPath "uninstall-$nonce.bak"
    Copy-Item -LiteralPath $PSCommandPath -Destination $staged
    try {
        [IO.File]::Replace($staged, $helperPath, $backup)
        try { New-ItemProperty -Path $uninstallKey -Name WebAppMakerLanguage -Value $Language -PropertyType String -Force | Out-Null; Set-ItemProperty -LiteralPath $uninstallKey -Name UninstallString -Value $nativeCommand }
        catch { [IO.File]::Replace($backup, $helperPath, $null); throw }
        Remove-Item -LiteralPath $backup -Force
    } finally { if (Test-Path -LiteralPath $staged) { Remove-Item -LiteralPath $staged -Force } }
} elseif ($Action -eq 'Install') {
    if (-not $Source -or -not $Name -or $Name.Length -gt 100) { throw 'Missing application source or name.' }
    $sourcePath = (Resolve-Path -LiteralPath $Source).Path
    $actualExeName = Get-ExecutableName $sourcePath
    if ($ExeName -ne $actualExeName) { throw 'Executable name does not match application metadata.' }
    if (-not (Test-Path -LiteralPath (Join-Path $sourcePath $actualExeName) -PathType Leaf) -or
        -not (Test-Path -LiteralPath (Join-Path $sourcePath 'pake-runtime\app.json') -PathType Leaf)) { throw 'Application source is incomplete.' }
    if (Test-Path -LiteralPath $appPath) { throw 'Application identity is already installed.' }
    $shortcut = Get-ShortcutPath $Name
    if ((Test-Path -LiteralPath $shortcut) -or (Test-Path -LiteralPath $uninstallKey)) { throw 'Application registration already exists.' }
    try {
        New-Item -ItemType Directory -Path $appsRoot -Force | Out-Null
        New-Item -ItemType Directory -Path $appPath | Out-Null
        Copy-Item -LiteralPath (Join-Path $sourcePath $actualExeName) -Destination $appPath
        Copy-Item -LiteralPath (Join-Path $sourcePath 'pake-runtime') -Destination $appPath -Recurse
        Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $appPath 'uninstall.ps1')
        $icon = Join-Path $sourcePath 'app.ico'
        if (Test-Path -LiteralPath $icon -PathType Leaf) { Copy-Item -LiteralPath $icon -Destination $appPath }
        New-Item -ItemType Directory -Path $startMenu -Force | Out-Null
        $shell = New-Object -ComObject WScript.Shell
        $link = $shell.CreateShortcut($shortcut)
        $link.TargetPath = Join-Path $appPath $actualExeName
        $link.WorkingDirectory = $appPath
        if (Test-Path -LiteralPath (Join-Path $appPath 'app.ico')) { $link.IconLocation = Join-Path $appPath 'app.ico' }
        $link.Save()
        $command = Set-NativeUninstaller
        New-Item -Path $uninstallKey | Out-Null
        New-ItemProperty -Path $uninstallKey -Name DisplayName -Value $Name -PropertyType String | Out-Null
        New-ItemProperty -Path $uninstallKey -Name WebAppMakerLanguage -Value $Language -PropertyType String | Out-Null
        $displayIcon = if (Test-Path -LiteralPath (Join-Path $appPath 'app.ico')) { Join-Path $appPath 'app.ico' } else { Join-Path $appPath $actualExeName }
        New-ItemProperty -Path $uninstallKey -Name DisplayIcon -Value $displayIcon -PropertyType String | Out-Null
        New-ItemProperty -Path $uninstallKey -Name InstallLocation -Value $appPath -PropertyType String | Out-Null
        New-ItemProperty -Path $uninstallKey -Name UninstallString -Value $command -PropertyType String | Out-Null
        New-ItemProperty -Path $uninstallKey -Name NoModify -Value 1 -PropertyType DWord | Out-Null
        New-ItemProperty -Path $uninstallKey -Name NoRepair -Value 1 -PropertyType DWord | Out-Null
        [Console]::Out.WriteLine((@{ path = $appPath; shortcut = $shortcut } | ConvertTo-Json -Compress))
    } catch {
        if (Test-Path -LiteralPath $uninstallKey) { Remove-Item -LiteralPath $uninstallKey -Force }
        if (Test-Path -LiteralPath $shortcut) { Remove-Item -LiteralPath $shortcut -Force }
        if (Test-Path -LiteralPath $appPath) { Assert-SafeAppDirectory; Remove-Item -LiteralPath $appPath -Recurse -Force }
        throw
    }
} else {
    if (-not (Test-Path -LiteralPath $uninstallKey)) { throw 'Application registration does not exist.' }
    $entry = Get-ItemProperty -LiteralPath $uninstallKey
    if ($entry.InstallLocation -ne $appPath) { throw 'Application location does not match its identity.' }
    Assert-SafeAppDirectory
    $actualExeName = Get-ExecutableName $appPath
    $running = Get-CimInstance Win32_Process -Filter "Name = '$actualExeName'" | Where-Object { $_.ExecutablePath -eq (Join-Path $appPath $actualExeName) }
    if ($running) { if ($SilentError) { throw 'Close the application before uninstalling it.' }; Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Close the application before uninstalling it.', 'WebAppMaker') | Out-Null; exit 1 }
    $shortcut = Get-ShortcutPath $entry.DisplayName
    # Check that the executable is not locked before deleting any other files.
    # A recently closed process may still hold the image briefly.
    $exe = Join-Path $appPath $actualExeName
    $handle = [IO.File]::Open($exe, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $handle.Dispose()
    Remove-Item -LiteralPath $appPath -Recurse -Force
    if (Test-Path -LiteralPath $shortcut) { Remove-Item -LiteralPath $shortcut -Force }
    Remove-Item -LiteralPath $uninstallKey -Force
}
