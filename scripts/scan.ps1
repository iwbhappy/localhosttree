$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$connections = @(Get-NetTCPConnection -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess)
$processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine)
@{ connections = $connections; processes = $processes } | ConvertTo-Json -Depth 4 -Compress
