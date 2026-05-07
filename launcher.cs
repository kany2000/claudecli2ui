using System;
using System.Diagnostics;
using System.Text;

class Launcher {
    static void Main(string[] args) {
        if (args.Length < 2) return;
        StringBuilder sb = new StringBuilder();
        for (int i = 2; i < args.Length; i++) {
            if (i > 2) sb.Append(' ');
            sb.Append('"').Append(args[i]).Append('"');
        }
        Process p = new Process();
        p.StartInfo.FileName = args[0];
        p.StartInfo.Arguments = sb.ToString();
        p.StartInfo.WorkingDirectory = args[1];
        p.StartInfo.UseShellExecute = false;
        p.StartInfo.CreateNoWindow = true;
        p.Start();
    }
}
