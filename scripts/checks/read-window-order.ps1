param([string]$Handles)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class DeskbotZOrder {
 public delegate bool Callback(IntPtr handle, IntPtr param);
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback, IntPtr param);
 [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr handle, int index);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 public static long[] Ordered() { var result=new List<long>(); EnumWindows((h,p)=>{result.Add(h.ToInt64());return true;},IntPtr.Zero);return result.ToArray(); }
}
'@
$wanted = @($Handles.Split(',') | ForEach-Object { [long]$_ })
$ordered = [DeskbotZOrder]::Ordered()
$rows = for ($i=0; $i -lt $ordered.Length; $i++) {
 if ($wanted -contains $ordered[$i]) {
  [pscustomobject]@{ handle=[string]$ordered[$i]; z=$i; top=([DeskbotZOrder]::GetWindowLong([IntPtr]$ordered[$i],-20) -band 8) -ne 0 }
 }
}
[pscustomobject]@{ foreground=[string][DeskbotZOrder]::GetForegroundWindow().ToInt64(); windows=@($rows) } | ConvertTo-Json -Compress
