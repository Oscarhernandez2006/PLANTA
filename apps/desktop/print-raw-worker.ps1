# Proceso de impresión RAW que queda abierto mientras corre la app.
# Compila la ayuda de WinSpool UNA sola vez y luego atiende trabajos por stdin,
# así cada etiqueta sale en milisegundos (abrir PowerShell y compilar con
# Add-Type en cada impresión tomaba varios segundos).
#
# Protocolo (una línea por trabajo, separada por TAB):
#   entrada:  <id> TAB <nombre impresora en base64> TAB <datos ZPL en base64>
#   salida:   <id> TAB OK TAB <bytes enviados>   |   <id> TAB ERR TAB <mensaje>
# Al arrancar escribe "READY" cuando ya está listo para imprimir.

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

function Enviar([string]$PrinterName, [byte[]]$Bytes) {
  $hPrinter = [IntPtr]::Zero
  if (-not [RawPrinterHelper.PrinterHelper]::OpenPrinter($PrinterName, [ref]$hPrinter, [IntPtr]::Zero)) {
    throw "No se pudo abrir la impresora '$PrinterName'. Verifica el nombre exacto en Windows."
  }
  try {
    $di = New-Object RawPrinterHelper.PrinterHelper+DOCINFOA
    $di.pDocName = 'Etiqueta ZPL'
    $di.pDataType = 'RAW'
    if (-not [RawPrinterHelper.PrinterHelper]::StartDocPrinter($hPrinter, 1, $di)) {
      throw 'No se pudo iniciar el trabajo de impresion (StartDocPrinter).'
    }
    try {
      [RawPrinterHelper.PrinterHelper]::StartPagePrinter($hPrinter) | Out-Null
      $ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($Bytes.Length)
      try {
        [System.Runtime.InteropServices.Marshal]::Copy($Bytes, 0, $ptr, $Bytes.Length)
        $written = 0
        if (-not [RawPrinterHelper.PrinterHelper]::WritePrinter($hPrinter, $ptr, $Bytes.Length, [ref]$written)) {
          throw 'Fallo al escribir los datos en la impresora (WritePrinter).'
        }
        return $written
      }
      finally {
        [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
        [RawPrinterHelper.PrinterHelper]::EndPagePrinter($hPrinter) | Out-Null
      }
    }
    finally {
      [RawPrinterHelper.PrinterHelper]::EndDocPrinter($hPrinter) | Out-Null
    }
  }
  finally {
    [RawPrinterHelper.PrinterHelper]::ClosePrinter($hPrinter) | Out-Null
  }
}

$salida = [Console]::Out
$salida.WriteLine('READY')
$salida.Flush()

while ($null -ne ($linea = [Console]::In.ReadLine())) {
  $partes = $linea.Split("`t")
  if ($partes.Length -lt 3) { continue }
  $id = $partes[0]
  try {
    $impresora = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($partes[1]))
    $datos = [Convert]::FromBase64String($partes[2])
    $enviados = Enviar $impresora $datos
    $salida.WriteLine("$id`tOK`t$enviados")
  }
  catch {
    $mensaje = ($_.Exception.Message -replace '[\t\r\n]+', ' ')
    $salida.WriteLine("$id`tERR`t$mensaje")
  }
  $salida.Flush()
}
