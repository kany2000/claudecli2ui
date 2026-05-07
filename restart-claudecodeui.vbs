' Restart Claude Code Web UI — kill old processes, start fresh with no console
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
CreateObject("WScript.Shell").Run _
  "C:\Users\Administrator\claudecodeui\launcher.exe" & _
  " ""C:\Program Files\nodejs\node.exe""" & _
  " ""C:\Users\Administrator\claudecodeui""" & _
  " ""C:\Users\Administrator\claudecodeui\watch-restart.js""", _
  0, False
