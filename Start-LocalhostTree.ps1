param([switch]$Widget, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$treePort = if ($env:LOCALHOST_TREE_PORT) { [int]$env:LOCALHOST_TREE_PORT } else { 7341 }
$treeUrl = "http://127.0.0.1:$treePort"
function Test-TreeServer {
    try { return (Invoke-RestMethod "$treeUrl/api/health" -TimeoutSec 2).app -eq 'localhost-tree' } catch { return $false }
}
if (-not (Test-TreeServer)) {
    $treeNode = (Get-Command node -ErrorAction Stop).Source
    Start-Process -FilePath $treeNode -ArgumentList ('"' + (Join-Path $PSScriptRoot 'server.mjs') + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
    $treeReady = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 300
        if (Test-TreeServer) { $treeReady = $true; break }
    }
    if (-not $treeReady) { throw "Localhost Tree could not start. Port $treePort may be busy. Run: node server.mjs" }
}
if ($NoBrowser) { Write-Output $treeUrl; exit }
if ($Widget) {
    $edgePaths = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe", "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe")
    $edgePath = $edgePaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($edgePath) {
        Start-Process -FilePath $edgePath -ArgumentList "--app=$treeUrl/?widget=1", '--window-size=760,580'
        exit
    }
}
Start-Process $treeUrl
