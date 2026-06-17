' Start Claude Code Web UI — no console window at all
CreateObject("WScript.Shell").Run _
  "E:\projects\claudecli2ui\launcher.exe" & _
  " ""C:\Program Files\nodejs\node.exe""" & _
  " ""E:\projects\claudecli2ui""" & _
  " ""E:\projects\claudecli2ui\watch-restart.js""", _
  0, False
