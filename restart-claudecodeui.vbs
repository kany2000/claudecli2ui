' Restart Claude Code Web UI silently (kill old, start fresh with no console window)
On Error Resume Next
Set wmi = GetObject("winmgmts:root\cimv2")
Set processes = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name='node.exe' AND CommandLine LIKE '%watch-restart%'")
For Each proc In processes
  proc.Terminate()
Next
Set processes = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name='node.exe' AND CommandLine LIKE '%cloudcli%dist-server%server%index.js%'")
For Each proc In processes
  proc.Terminate()
Next
WScript.Sleep 2000
Set service = CreateObject("Schedule.Service")
service.Connect()
Set task = service.GetFolder("\").GetTask("ClaudeCodeUI")
If Err.Number = 0 Then
  task.Run(False)
Else
  CreateObject("WScript.Shell").Run "cmd /c cd /d C:\Users\Administrator\claudecodeui && node watch-restart.js", 0, False
End If
