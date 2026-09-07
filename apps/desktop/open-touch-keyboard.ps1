# Muestra el teclado táctil de Windows con el método moderno InputPane.TryShow
# (funciona en Windows 10 1803+ y Windows 11, donde el COM viejo ya no sirve).
$ErrorActionPreference = 'SilentlyContinue'

$src = @"
using System;
using System.Runtime.InteropServices;
public static class TouchKb {
  [ComImport, Guid("75CF2C57-9195-4931-8332-F0B409E916AF"),
   InterfaceType(ComInterfaceType.InterfaceIsIInspectable)]
  public interface IInputPaneInterop {
    [return: MarshalAs(UnmanagedType.IInspectable)]
    object GetForWindow(IntPtr appWindow, [In] ref Guid riid);
  }
  [ComImport, Guid("8A6B3F26-7090-4793-944C-C3F2CDE26276"),
   InterfaceType(ComInterfaceType.InterfaceIsIInspectable)]
  public interface IInputPane2 { bool TryShow(); bool TryHide(); }
  [DllImport("combase.dll")]
  static extern int RoGetActivationFactory(
    [MarshalAs(UnmanagedType.HString)] string activatableClassId,
    [In] ref Guid iid,
    [MarshalAs(UnmanagedType.IInspectable)] out object factory);
  [DllImport("user32.dll")]
  static extern IntPtr GetForegroundWindow();
  public static bool Show() {
    Guid interopIid = typeof(IInputPaneInterop).GUID;
    object factoryObj;
    if (RoGetActivationFactory("Windows.UI.ViewManagement.InputPane",
        ref interopIid, out factoryObj) != 0) return false;
    var interop = (IInputPaneInterop)factoryObj;
    Guid pane2Iid = typeof(IInputPane2).GUID;
    object pane = interop.GetForWindow(GetForegroundWindow(), ref pane2Iid);
    return ((IInputPane2)pane).TryShow();
  }
}
"@

try {
  Add-Type -TypeDefinition $src -Language CSharp
  [TouchKb]::Show() | Out-Null
} catch {
  # Respaldo para Windows antiguos: TabTip + COM Toggle.
  $tabTip = Join-Path $env:CommonProgramFiles 'Microsoft Shared\ink\TabTip.exe'
  if (-not (Get-Process -Name TabTip -ErrorAction SilentlyContinue)) {
    Start-Process $tabTip
  }
}

