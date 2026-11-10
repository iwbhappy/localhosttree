[CmdletBinding(DefaultParameterSetName = 'Browser')]
param(
    [Parameter(ParameterSetName = 'Widget')][switch]$Widget,
    [Parameter(ParameterSetName = 'Browser')][switch]$Browser,
    [Parameter(ParameterSetName = 'Api')][switch]$Api,
    [Parameter(ParameterSetName = 'Choose')][switch]$Choose,
    [Parameter(ParameterSetName = 'Server')][switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
if ($Choose) {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TreeLauncherWindow {
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
}
'@
    [System.Windows.Forms.Application]::EnableVisualStyles()
    $treeForm = New-Object System.Windows.Forms.Form
    $treeForm.Text = 'Localhost Tree'
    $treeForm.ClientSize = New-Object System.Drawing.Size(460, 355)
    $treeForm.StartPosition = 'CenterScreen'
    $treeForm.FormBorderStyle = 'FixedDialog'
    $treeForm.MaximizeBox = $false
    $treeForm.BackColor = [System.Drawing.Color]::FromArgb(246, 247, 243)
    $treeForm.Font = New-Object System.Drawing.Font('Segoe UI', 10)
    $treeTitle = New-Object System.Windows.Forms.Label
    $treeTitle.Text = 'Как открыть Localhost Tree?'
    $treeTitle.Font = New-Object System.Drawing.Font('Segoe UI', 16, [System.Drawing.FontStyle]::Bold)
    $treeTitle.SetBounds(24, 25, 412, 35)
    $treeForm.Controls.Add($treeTitle)
    $treeCaption = New-Object System.Windows.Forms.Label
    $treeCaption.Text = 'Твои локальные проекты — в удобном формате.'
    $treeCaption.SetBounds(25, 65, 412, 25)
    $treeCaption.ForeColor = [System.Drawing.Color]::FromArgb(115, 135, 110)
    $treeForm.Controls.Add($treeCaption)
    $treeModes = @(
        @{ Mode = 'Widget'; Text = 'Виджет'; Description = 'Компактное отдельное окно' },
        @{ Mode = 'Browser'; Text = 'Браузер'; Description = 'Полная панель портов и проектов' },
        @{ Mode = 'Api'; Text = 'API'; Description = 'Просмотр, фильтры и копирование JSON' }
    )
    $treeY = 108
    foreach ($treeMode in $treeModes) {
        $treeButton = New-Object System.Windows.Forms.Button
        $treeButton.Text = $treeMode.Text + '   /   ' + $treeMode.Description
        $treeButton.Tag = $treeMode.Mode
        $treeButton.SetBounds(24, $treeY, 412, 60)
        $treeButton.TextAlign = 'MiddleLeft'
        $treeButton.Padding = New-Object System.Windows.Forms.Padding(14, 0, 0, 0)
        $treeButton.FlatStyle = 'Flat'
        $treeButton.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(216, 227, 208)
        $treeButton.BackColor = [System.Drawing.Color]::White
        $treeButton.ForeColor = [System.Drawing.Color]::FromArgb(45, 90, 60)
        $treeButton.Add_Click({ param($sender, $eventArgs) $sender.FindForm().Tag = $sender.Tag; $sender.FindForm().Close() })
        $treeForm.Controls.Add($treeButton)
        $treeY += 72
    }
    # WScript hides the console with SW_HIDE; explicitly show the interactive form.
    $treeForm.Add_Shown({ [void][TreeLauncherWindow]::ShowWindow($this.Handle, 5); [void][TreeLauncherWindow]::SetForegroundWindow($this.Handle) })
    [void]$treeForm.ShowDialog()
    $treeSelectedMode = $treeForm.Tag
    $treeForm.Dispose()
    if (-not $treeSelectedMode) { return }
    $Widget = $treeSelectedMode -eq 'Widget'
    $Api = $treeSelectedMode -eq 'Api'
}
$treePort = if ($env:LOCALHOST_TREE_PORT) { [int]$env:LOCALHOST_TREE_PORT } else { 7341 }
if ($treePort -lt 1024 -or $treePort -gt 65535) { throw 'LOCALHOST_TREE_PORT must be between 1024 and 65535.' }
$treeUrl = "http://127.0.0.1:$treePort"
function Test-TreeServer {
    try { return (Invoke-RestMethod "$treeUrl/api/health" -TimeoutSec 2).app -eq 'localhost-tree' } catch { return $false }
}
if (-not (Test-TreeServer)) {
    $treeNode = (Get-Command node -ErrorAction Stop).Source
    $treeData = Join-Path $PSScriptRoot 'data'
    [void](New-Item -Path $treeData -ItemType Directory -Force)
    $treeServer = Start-Process -FilePath $treeNode -ArgumentList ('"' + (Join-Path $PSScriptRoot 'server.mjs') + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $treeData 'server.log') -RedirectStandardError (Join-Path $treeData 'server-error.log') -PassThru
    $treeReady = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 300
        if (Test-TreeServer) { $treeReady = $true; break }
        if ($treeServer.HasExited) { break }
    }
    if (-not $treeReady) { throw "Localhost Tree could not start. Port $treePort may be busy. Check data/server-error.log or run: node server.mjs" }
}
if ($NoBrowser) { Write-Output $treeUrl; exit }
if ($Widget) {
    $edgePaths = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe", "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe")
    $edgePath = $edgePaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($edgePath) {
        Start-Process -FilePath $edgePath -ArgumentList "--app=$treeUrl/widget", '--window-size=760,620'
        exit
    }
    $treeUrl += '/widget'
}
if ($Api) { $treeUrl += '/api' }
Start-Process $treeUrl
