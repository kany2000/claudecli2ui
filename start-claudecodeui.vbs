' Start Claude Code Web UI — no console window at all
CreateObject("WScript.Shell").Run _
  "C:\Users\Administrator\claudecodeui\launcher.exe" & _
  " ""C:\Program Files\nodejs\node.exe""" & _
  " ""C:\Users\Administrator\claudecodeui""" & _
  " ""C:\Users\Administrator\claudecodeui\watch-restart.js""", _
  0, False
