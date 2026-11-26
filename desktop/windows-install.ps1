param(
    [Parameter(Mandatory = $true)] [ValidateSet('Install', 'Remove', 'UpgradeUninstaller', 'CleanShortcut')] [string] $Action,
    [Parameter(Mandatory = $true)] [string] $AppId,
    [string] $Source,
    [string] $Name,
    [string] $ExeName,
    [string] $UninstallerPath,
    [ValidateSet('vi', 'en')] [string] $Language = 'vi',
    [switch] $DeleteData,
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

function Get-ShortcutPath([string] $appName, [switch] $Legacy) {
    # Some Windows hosts cannot create shortcuts with every Unicode code point.
    # Keep the original display name in the registry and use a stable ASCII
    # filename so creation and removal compute the exact same path.
    $normalized = $appName.Normalize([Text.NormalizationForm]::FormD)
    $safeName = ($normalized -replace '\p{Mn}', '' -replace '[^a-zA-Z0-9 _.-]', '_').Trim(' ', '.')
    if (-not $safeName) { $safeName = 'Web App' }
    if ($safeName.Length -gt 60) { $safeName = $safeName.Substring(0, 60).TrimEnd(' ', '.') }
    if ($Legacy) { return Join-Path $startMenu ("$safeName [$($AppId.Substring(0, 8))].lnk") }
    if (-not $safeName -or $safeName -match '^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)') { $safeName = 'Web App' }
    return Join-Path $startMenu ("$safeName.lnk")
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

if ($Action -eq 'CleanShortcut') {
    if (-not (Test-Path -LiteralPath $uninstallKey)) { throw 'Application registration does not exist.' }
    $entry = Get-ItemProperty -LiteralPath $uninstallKey
    if ($entry.InstallLocation -ne $appPath) { throw 'Application location does not match its identity.' }
    Assert-SafeAppDirectory
    $exeName = Get-ExecutableName $appPath
    $old = Get-ShortcutPath $entry.DisplayName -Legacy
    $new = Get-ShortcutPath $entry.DisplayName
    if ($entry.WebAppMakerShortcut -and $entry.WebAppMakerShortcut -ne $old) { throw 'Shortcut is already named or belongs to another location.' }
    if (-not (Test-Path -LiteralPath $old -PathType Leaf)) { throw 'Existing shortcut was not found.' }
    if (Test-Path -LiteralPath $new) { throw 'A shortcut with this name already exists.' }
    $shell = New-Object -ComObject WScript.Shell
    if ($shell.CreateShortcut($old).TargetPath -ne (Join-Path $appPath $exeName)) { throw 'Shortcut belongs to another application.' }
    Move-Item -LiteralPath $old -Destination $new
    try { New-ItemProperty -Path $uninstallKey -Name WebAppMakerShortcut -Value $new -PropertyType String -Force | Out-Null }
    catch { Move-Item -LiteralPath $new -Destination $old; throw }
    [Console]::Out.WriteLine((@{ shortcut = $new } | ConvertTo-Json -Compress))
} elseif ($Action -eq 'UpgradeUninstaller') {
    if (-not (Test-Path -LiteralPath $uninstallKey)) { throw 'Application registration does not exist.' }
    $entry = Get-ItemProperty -LiteralPath $uninstallKey
    if ($entry.InstallLocation -ne $appPath) { throw 'Application location does not match its identity.' }
    Assert-SafeAppDirectory
    if ((Get-ExecutableName $appPath) -ieq 'Uninstall.exe') { throw 'The application executable conflicts with the uninstaller filename.' }
    $nativeCommand = Set-NativeUninstaller
    $launcher = Join-Path $appPath 'Uninstall.exe'
    $nonce = [Guid]::NewGuid().ToString('N')
    $staged = Join-Path $appPath "uninstaller-$nonce.tmp"
    $backup = Join-Path $appPath "uninstaller-$nonce.bak"
    $replaced = Test-Path -LiteralPath $launcher -PathType Leaf
    if ($replaced) {
        $existing = Get-Item -LiteralPath $launcher -Force
        if ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Uninstaller launcher cannot be a link.' }
        $oldCommand = [string] $entry.UninstallString
        if ($oldCommand -notmatch '^"([^"\r\n]+)" ([0-9a-f-]+)$' -or $Matches[2] -ne $AppId) { throw 'Existing uninstaller launcher cannot be verified.' }
        $oldHelper = $Matches[1]
        $helpers = Join-Path (Split-Path -Parent $appsRoot) 'uninstallers'
        $oldHash = [IO.Path]::GetFileNameWithoutExtension($oldHelper)
        if ([IO.Path]::GetDirectoryName($oldHelper) -ne $helpers -or [IO.Path]::GetFileName($oldHelper) -notmatch '^[0-9a-f]{64}\.exe$' -or (Get-FileHash -LiteralPath $launcher -Algorithm SHA256).Hash -ne $oldHash) { throw 'Existing uninstaller launcher cannot be verified.' }
    }
    Copy-Item -LiteralPath $UninstallerPath -Destination $staged
    try {
        if ($replaced) { [IO.File]::Replace($staged, $launcher, $backup) } else { [IO.File]::Move($staged, $launcher) }
        try { New-ItemProperty -Path $uninstallKey -Name WebAppMakerLanguage -Value $Language -PropertyType String -Force | Out-Null; Set-ItemProperty -LiteralPath $uninstallKey -Name UninstallString -Value $nativeCommand }
        catch { if ($replaced) { [IO.File]::Replace($backup, $launcher, $null) } else { Remove-Item -LiteralPath $launcher -Force }; throw }
        if ($replaced) { Remove-Item -LiteralPath $backup -Force }
    } finally { if (Test-Path -LiteralPath $staged) { Remove-Item -LiteralPath $staged -Force } }
} elseif ($Action -eq 'Install') {
    if (-not $Source -or -not $Name -or $Name.Length -gt 100) { throw 'Missing application source or name.' }
    $sourcePath = (Resolve-Path -LiteralPath $Source).Path
    $actualExeName = Get-ExecutableName $sourcePath
    if ($actualExeName -ieq 'Uninstall.exe') { throw 'The application executable conflicts with the uninstaller filename.' }
    if ($ExeName -ne $actualExeName) { throw 'Executable name does not match application metadata.' }
    if (-not (Test-Path -LiteralPath (Join-Path $sourcePath $actualExeName) -PathType Leaf) -or
        -not (Test-Path -LiteralPath (Join-Path $sourcePath 'pake-runtime\app.json') -PathType Leaf)) { throw 'Application source is incomplete.' }
    if (Test-Path -LiteralPath $appPath) { throw 'Application identity is already installed.' }
    $shortcut = Get-ShortcutPath $Name
    if (Test-Path -LiteralPath $shortcut) { $shortcut = Get-ShortcutPath $Name -Legacy }
    if ((Test-Path -LiteralPath $shortcut) -or (Test-Path -LiteralPath $uninstallKey)) { throw 'Application registration already exists.' }
    try {
        New-Item -ItemType Directory -Path $appsRoot -Force | Out-Null
        New-Item -ItemType Directory -Path $appPath | Out-Null
        Copy-Item -LiteralPath (Join-Path $sourcePath $actualExeName) -Destination $appPath
        Copy-Item -LiteralPath (Join-Path $sourcePath 'pake-runtime') -Destination $appPath -Recurse
        Copy-Item -LiteralPath $UninstallerPath -Destination (Join-Path $appPath 'Uninstall.exe')
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
        New-ItemProperty -Path $uninstallKey -Name WebAppMakerShortcut -Value $shortcut -PropertyType String | Out-Null
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
    if ($running) { if ($SilentError) { throw 'Close the application before uninstalling it.' }; Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Close the application before uninstalling it.', 'WebAppEz') | Out-Null; exit 1 }
    $shortcut = if ($entry.WebAppMakerShortcut) { [string] $entry.WebAppMakerShortcut } else { Get-ShortcutPath $entry.DisplayName -Legacy }
    $plainShortcut = Get-ShortcutPath $entry.DisplayName
    $legacyShortcut = Get-ShortcutPath $entry.DisplayName -Legacy
    if ($shortcut -ne $plainShortcut -and $shortcut -ne $legacyShortcut) { throw 'Invalid shortcut path.' }
    if (Test-Path -LiteralPath $shortcut) {
        $shell = New-Object -ComObject WScript.Shell
        if ($shell.CreateShortcut($shortcut).TargetPath -ne (Join-Path $appPath $actualExeName)) { throw 'Shortcut belongs to another application.' }
    }
    # Check that the executable is not locked before deleting any other files.
    # A recently closed process may still hold the image briefly.
    $exe = Join-Path $appPath $actualExeName
    $handle = [IO.File]::Open($exe, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $handle.Dispose()
    if ($DeleteData) {
        $metadata = Get-Content -LiteralPath (Join-Path $appPath 'pake-runtime\app.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $identifier = 'com.webappmaker.app' + $AppId.Replace('-', '')
        if ($metadata.identifier -cne $identifier) { throw 'Application data identity does not match.' }
        $profileRoot = [Environment]::GetFolderPath('ApplicationData')
        $profile = Join-Path $profileRoot $identifier
        if (Test-Path -LiteralPath $profile) {
            $item = Get-Item -LiteralPath $profile -Force
            if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Application data directory is unsafe.' }
            $resolvedProfile = (Resolve-Path -LiteralPath $profile).Path
            if ($resolvedProfile -ne $profile -or (Split-Path -Parent $resolvedProfile) -ne $profileRoot) { throw 'Application data path is unsafe.' }
            $links = @(Get-ChildItem -LiteralPath $profile -Force -Recurse | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
            if ($links.Count -gt 0) { throw 'Application data contains links and cannot be safely removed.' }
            Remove-Item -LiteralPath $profile -Recurse -Force
        }
    }
    Remove-Item -LiteralPath $appPath -Recurse -Force
    if (Test-Path -LiteralPath $shortcut) { Remove-Item -LiteralPath $shortcut -Force }
    Remove-Item -LiteralPath $uninstallKey -Force
}
