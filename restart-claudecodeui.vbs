' Restart Claude Code UI silently (no console windows at all)
Set wmi = GetObject("winmgmts:root\cimv2")

' Kill any existing cloudcli server processes
Set processes = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name='node.exe' AND CommandLine LIKE '%cloudcli%dist-server%server%index.js%'")
For Each proc In processes
  proc.Terminate()
Next

' Wait for port to release
WScript.Sleep 2000

' Start fresh watchdog with NO console window
Set startup = wmi.Get("Win32_ProcessStartup")
startup.CreateFlags = 134217728  ' &H08000000 = CREATE_NO_WINDOW
wmi.Get("Win32_Process").Create _
  "C:\Program Files\nodejs\node.exe C:\Users\Administrator\claudecodeui\watch-restart.js", _
  "C:\Users\Administrator\claudecodeui", startup
