param([switch]$AllModes, [string]$Destination = [Environment]::GetFolderPath('Desktop'))
$ErrorActionPreference = 'Stop'
if (-not $Destination) { throw 'Desktop folder is unavailable. Pass -Destination with a folder path.' }
[void](New-Item -ItemType Directory -Path $Destination -Force)
$treeShell = New-Object -ComObject WScript.Shell
$treeLinks = @(@{ Name = 'Localhost Tree'; Script = 'Start.vbs'; Description = 'Choose: widget, browser, or API' })
if ($AllModes) {
    $treeLinks += @(
        @{ Name = 'Localhost Tree - Widget'; Script = 'Widget.vbs'; Description = 'Open the desktop widget' },
        @{ Name = 'Localhost Tree - Browser'; Script = 'Open.vbs'; Description = 'Open the port dashboard in your browser' },
        @{ Name = 'Localhost Tree - API'; Script = 'Api.vbs'; Description = 'Open the local API explorer' }
    )
}
foreach ($treeLink in $treeLinks) {
    $treeShortcutPath = Join-Path $Destination ($treeLink.Name + '.lnk')
    $treeScriptPath = Join-Path $PSScriptRoot $treeLink.Script
    if (-not (Test-Path -LiteralPath $treeScriptPath)) { throw "Launcher not found: $treeScriptPath" }
    if (Test-Path -LiteralPath $treeShortcutPath) {
        $treeExisting = $treeShell.CreateShortcut($treeShortcutPath)
        if ($treeExisting.Arguments -ne ('"' + $treeScriptPath + '"')) { throw "A different shortcut already exists: $treeShortcutPath" }
    }
    $treeShortcut = $treeShell.CreateShortcut($treeShortcutPath)
    $treeShortcut.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
    $treeShortcut.Arguments = '"' + $treeScriptPath + '"'
    $treeShortcut.WorkingDirectory = $PSScriptRoot
    $treeShortcut.Description = $treeLink.Description
    $treeShortcut.IconLocation = Join-Path $env:SystemRoot 'System32\shell32.dll, 14'
    $treeShortcut.Save()
    Write-Output $treeShortcutPath
}
