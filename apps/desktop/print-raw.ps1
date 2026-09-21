# Envía datos crudos (RAW) directamente al spooler de Windows, sin pasar por
# el driver de reformateo (necesario para ZPL: el driver "normal" lo
# reinterpretaría como texto/gráfico y arruinaría la etiqueta).
# Técnica clásica de Microsoft (KB322091) portada a PowerShell.
param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FilePath
)

$ErrorActionPreference = 'Stop'

Add-Type -Namespace RawPrinterHelper -Name PrinterHelper -MemberDefinition @"
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
public class DOCINFOA {
  [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
  [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
  [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
}

[DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

[DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
public static extern bool ClosePrinter(IntPtr hPrinter);

[DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

[DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
public static extern bool EndDocPrinter(IntPtr hPrinter);

[DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
public static extern bool StartPagePrinter(IntPtr hPrinter);

[DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
public static extern bool EndPagePrinter(IntPtr hPrinter);

[DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
"@

$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$hPrinter = [IntPtr]::Zero

$opened = [RawPrinterHelper.PrinterHelper]::OpenPrinter($PrinterName, [ref]$hPrinter, [IntPtr]::Zero)
if (-not $opened) {
  Write-Error "No se pudo abrir la impresora '$PrinterName'. Verifica el nombre exacto en Windows."
  exit 1
}

try {
  $di = New-Object RawPrinterHelper.PrinterHelper+DOCINFOA
  $di.pDocName = 'Presinto ZPL'
  $di.pDataType = 'RAW'

  $started = [RawPrinterHelper.PrinterHelper]::StartDocPrinter($hPrinter, 1, $di)
  if (-not $started) {
    Write-Error 'No se pudo iniciar el trabajo de impresion (StartDocPrinter).'
    exit 1
  }

  try {
    [RawPrinterHelper.PrinterHelper]::StartPagePrinter($hPrinter) | Out-Null

    $ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
    try {
      [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
      $written = 0
      $writeOk = [RawPrinterHelper.PrinterHelper]::WritePrinter($hPrinter, $ptr, $bytes.Length, [ref]$written)
      if (-not $writeOk) {
        Write-Error 'Fallo al escribir los datos en la impresora (WritePrinter).'
        exit 1
      }
      Write-Output "OK: $written bytes enviados a '$PrinterName'."
    }
    finally {
      [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
    }
  }
  finally {
    [RawPrinterHelper.PrinterHelper]::EndPagePrinter($hPrinter) | Out-Null
  }
}
finally {
  [RawPrinterHelper.PrinterHelper]::EndDocPrinter($hPrinter) | Out-Null
  [RawPrinterHelper.PrinterHelper]::ClosePrinter($hPrinter) | Out-Null
}
