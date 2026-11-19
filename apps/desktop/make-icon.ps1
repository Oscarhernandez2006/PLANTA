# Genera build/icon.png (logo de la empresa + SIGPRO) para el ejecutable y la ventana.
Add-Type -AssemblyName System.Drawing
$desk = $PSScriptRoot
New-Item -ItemType Directory -Force "$desk\build" | Out-Null
$logo = [System.Drawing.Image]::FromFile((Resolve-Path "$desk\..\web\src\assets\logo-santacruz.png"))
$S = 512
$bmp = New-Object System.Drawing.Bitmap $S, $S
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.InterpolationMode = 'HighQualityBicubic'
$g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.Color]::Transparent)
$r = 96
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(0, 0, $r, $r, 180, 90)
$path.AddArc($S - $r, 0, $r, $r, 270, 90)
$path.AddArc($S - $r, $S - $r, $r, $r, 0, 90)
$path.AddArc(0, $S - $r, $r, $r, 90, 90)
$path.CloseFigure()
$g.FillPath([System.Drawing.Brushes]::White, $path)
$w = 460
$h = [int]($logo.Height * $w / $logo.Width)
$g.DrawImage($logo, [int](($S - $w) / 2), 34, $w, $h)
$font = New-Object System.Drawing.Font('Segoe UI Black', 92, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#111827'))
$g.DrawString('SIGPRO', $font, $brush, (New-Object System.Drawing.RectangleF 0, (34 + $h + 6), $S, 120), $fmt)
$g.Dispose()
$bmp.Save("$desk\build\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$logo.Dispose()
Write-Output "icon.png generado"
