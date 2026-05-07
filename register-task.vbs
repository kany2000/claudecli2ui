' Register Claude Code Web UI as a hidden scheduled task (no console window at boot)
' Run this ONCE to set up auto-start via Task Scheduler.
' After running this, ClaudeCodeWebUI.vbs in the Startup folder is optional
' (the task runs automatically at every logon with zero window flash).

Set service = CreateObject("Schedule.Service")
service.Connect()

' Delete existing task if any
On Error Resume Next
service.GetFolder("\").DeleteTask "ClaudeCodeUI", 0
On Error Goto 0

' Create new task
Set taskDef = service.NewTask(0)
taskDef.RegistrationInfo.Description = "Claude Code Web UI"
taskDef.Settings.Hidden = True
taskDef.Settings.DisallowStartIfOnBatteries = False
taskDef.Settings.StopIfGoingOnBatteries = False
taskDef.Settings.ExecutionTimeLimit = "PT0S"

' Trigger: run at every user logon
Set trigger = taskDef.Triggers.Create(9) ' TASK_TRIGGER_LOGON

' Action: launch node watch-restart.js
Set action = taskDef.Actions.Create(0) ' TASK_ACTION_EXEC
action.Path = "C:\Program Files\nodejs\node.exe"
action.Arguments = "C:\Users\Administrator\claudecodeui\watch-restart.js"
action.WorkingDirectory = "C:\Users\Administrator\claudecodeui"

' Register (6 = UpdateOrCreate, 3 = IgnoreNeutralUserContext)
service.GetFolder("\").RegisterTaskDefinition "ClaudeCodeUI", taskDef, 6, "", "", 3

' Run it immediately for this session
Set task = service.GetFolder("\").GetTask("ClaudeCodeUI")
task.Run(False)

MsgBox "Task registered! Claude Code Web UI will now start at every logon with no console window.", vbInformation, "Claude Code Web UI"
