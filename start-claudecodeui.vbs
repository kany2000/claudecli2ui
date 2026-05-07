' Start Claude Code Web UI with no console window
' Uses hidden Task Scheduler task to prevent window flash

On Error Resume Next
Set service = CreateObject("Schedule.Service")
service.Connect()
Set task = service.GetFolder("\").GetTask("ClaudeCodeUI")
If Err.Number = 0 Then
  task.Run(False)
Else
  CreateObject("WScript.Shell").Run "cmd /c cd /d C:\Users\Administrator\claudecodeui && node watch-restart.js", 0, False
End If
