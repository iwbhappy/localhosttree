Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
script = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "Start-LocalhostTree.ps1")
result = shell.Run("powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File """ & script & """ -Choose", 0, True)
If result <> 0 Then shell.Popup "Could not start Localhost Tree. Check data/server-error.log or run node server.mjs in a terminal.", 0, "Localhost Tree", 16
