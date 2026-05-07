' Start Claude Code Web UI with NO console window at all
' Uses WMI Win32_Process.Create with CREATE_NO_WINDOW flag
Set wmi = GetObject("winmgmts:root\cimv2")
Set startup = wmi.Get("Win32_ProcessStartup")
startup.CreateFlags = 134217728  ' &H08000000 = CREATE_NO_WINDOW
wmi.Get("Win32_Process").Create _
  "C:\Program Files\nodejs\node.exe C:\Users\Administrator\claudecodeui\watch-restart.js", _
  "C:\Users\Administrator\claudecodeui", startup
