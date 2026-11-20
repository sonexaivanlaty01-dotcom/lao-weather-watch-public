' Starts run-once.cmd without showing a console window.
Set shell = CreateObject("WScript.Shell")
folder = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run """" & folder & "\run-once.cmd""", 0, False
